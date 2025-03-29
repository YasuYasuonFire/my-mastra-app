import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

// 記事の型定義
type Article = {
  title: string;
  url: string;
  date: string;
  author: string;
  authorFromIntro?: string;  // 記事の冒頭からの著者情報
  authorFromData?: string;   // data-user-name属性からの著者情報
  summary: string;
  categories: string[];
};

// デバッグ用のロガー関数
const debugLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG][${timestamp}] ${message}`);
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2));
  }
};

export const tecotecBlogScraperTool = createTool({
  id: "tecotec-blog-scraper",
  description: "テコテックブログ(https://tec.tecotec.co.jp/)から特定期間内の記事一覧を取得します",
  inputSchema: z.object({
    startDate: z.string().describe("取得開始日（YYYY-MM-DD形式）"),
    endDate: z.string().describe("取得終了日（YYYY-MM-DD形式）"),
    maxPages: z.number().optional().default(5).describe("取得する最大ページ数")
  }),
  execute: async ({ context }) => {
    const { startDate, endDate, maxPages = 5 } = context;
    const blogUrl = "https://tec.tecotec.co.jp/";
    
    debugLog(`スクレイピングを開始します。期間: ${startDate} 〜 ${endDate}, 最大ページ数: ${maxPages}`);
    
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // 年単位でのアーカイブURLを生成
    const years = new Set<number>();
    for (let year = startDateObj.getFullYear(); year <= endDateObj.getFullYear(); year++) {
      years.add(year);
    }
    
    debugLog(`検索対象年: ${[...years].join(', ')}`);
    
    // 収集した記事を格納する配列
    const articles: Article[] = [];
    
    // アーカイブページと通常ページの両方を処理
    const urlsToCheck = [...Array.from(years).map(year => `${blogUrl}archive/${year}`), blogUrl];
    debugLog(`検索対象URL: ${urlsToCheck.join(', ')}`);
    
    // 各URLを処理
    for (const baseUrl of urlsToCheck) {
      let currentPage = 1;
      let hasNextPage = true;
      
      debugLog(`URLの処理を開始: ${baseUrl}`);
      
      // ページごとにスクレイピング
      while (hasNextPage && currentPage <= maxPages) {
        const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl}?page=${currentPage}`;
        debugLog(`ページをスクレイピング中: ${pageUrl}`);
        
        try {
          // ページのHTMLを取得
          debugLog(`HTTPリクエスト送信: ${pageUrl}`);
          const response = await fetch(pageUrl, { 
            headers: { 
              'User-Agent': 'Mozilla/5.0 (compatible; MastraBot/1.0)' 
            }
          });
          
          debugLog(`HTTP応答ステータス: ${response.status}`);
          
          // ステータスコードをチェック
          if (response.status !== 200) {
            debugLog(`不正なステータスコード ${response.status} for ${pageUrl}, このURLはスキップします`);
            break;
          }
          
          const html = await response.text();
          debugLog(`HTMLを取得しました (${html.length} バイト)`);
          
          const $ = cheerio.load(html);
          
          // はてなブログの記事エントリを取得
          // アーカイブページの構造に合わせたセレクタを使用
          const entries = $('.archive-entry');
          debugLog(`検出されたエントリ数: ${entries.length}`);
          
          // このページに記事がない場合は次のページはない
          if (entries.length === 0) {
            debugLog(`エントリが見つかりませんでした。このURLの処理を終了します`);
            hasNextPage = false;
            continue;
          }
          
          // 各記事の情報を抽出
          entries.each((i, el) => {
            debugLog(`エントリ ${i+1}/${entries.length} 処理中`);
            
            // アーカイブページの記事要素から情報を抽出
            const titleElement = $(el).find('.entry-title a');
            const title = titleElement.text().trim();
            const url = titleElement.attr('href');
            
            // 日付情報の取得
            const dateElement = $(el).find('.archive-date time');
            let dateText = dateElement.attr('datetime');
            
            debugLog(`抽出データ: タイトル="${title}", URL=${url}, 日付属性=${dateText}`);
            
            // datetime属性がない場合は、テキストコンテンツから日付を抽出
            if (!dateText) {
              const dateContent = dateElement.text().trim();
              debugLog(`datetime属性がありません。テキストから抽出を試みます: "${dateContent}"`);
              const dateMatch = dateContent.match(/(\d{4})[^\d]+(\d{1,2})[^\d]+(\d{1,2})/);
              if (dateMatch) {
                dateText = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
                debugLog(`テキストから日付を抽出しました: ${dateText}`);
              } else {
                debugLog(`テキストから日付を抽出できませんでした`);
              }
            }
            
            // 著者情報（アーカイブページにはない場合もある）
            const authorFromEntry = $(el).find('.entry-author-name').text().trim();
            
            // data-user-name属性からの著者情報
            const authorFromData = $(el).attr('data-user-name') || '';
            debugLog(`著者情報: エントリから="${authorFromEntry}", data属性から="${authorFromData}"`);
            
            // 記事の概要
            const summary = $(el).find('.entry-description').text().trim();
            
            // 記事の冒頭からの著者情報を抽出
            let authorFromIntro = '';
            const summaryText = summary || '';
            const introMatch = summaryText.match(/こんにちは[。、\.!！]?\s*([^。]+部の([^\s。]+))です/);
            if (introMatch) {
              authorFromIntro = introMatch[2] || '';
              debugLog(`冒頭から著者を抽出: "${authorFromIntro}"`);
            }
            
            debugLog(`追加データ: 著者(エントリ)="${authorFromEntry}", 著者(冒頭)="${authorFromIntro}", 著者(data)="${authorFromData}", 概要の長さ=${summary.length}`);
            
            // カテゴリ情報の取得
            const categories: string[] = [];
            
            // カテゴリタグの取得（archive-entry-tagsクラスの要素から）
            $(el).find('.archive-entry-tags .archive-entry-tag-label').each((i, el) => {
              const category = $(el).text().trim();
              categories.push(category);
              debugLog(`カテゴリ ${i+1}: ${category}`);
            });
            
            // 日付のパース
            if (dateText) {
              debugLog(`日付のパース: ${dateText}`);
              const articleDate = new Date(dateText);
              
              debugLog(`パース結果: ${articleDate.toISOString()}`);
              debugLog(`期間チェック: ${articleDate.getTime()} >= ${startDateObj.getTime()} && ${articleDate.getTime()} <= ${endDateObj.getTime()}`);
              
              // 指定された期間内の記事のみを追加
              if (articleDate >= startDateObj && articleDate <= endDateObj) {
                debugLog(`期間内の記事です`);
                // 重複チェック（URL で確認）
                const isDuplicate = articles.some(article => article.url === url);
                if (isDuplicate) {
                  debugLog(`重複記事のためスキップします: ${url}`);
                } else {
                  debugLog(`記事を追加します: ${title}`);
                  // 著者情報の優先順位: エントリから > data属性から > 冒頭から > デフォルト
                  const author = authorFromEntry || authorFromData || authorFromIntro || 'テコテック';
                  
                  articles.push({
                    title,
                    url: url || '',
                    date: articleDate.toISOString().split('T')[0],
                    author,
                    authorFromIntro,
                    authorFromData,
                    summary: summary || `${title}...`,
                    categories
                  });
                }
              } else {
                debugLog(`期間外の記事のためスキップします`);
              }
            } else {
              debugLog(`日付情報がないためスキップします`);
            }
          });
          
          // 「次のページ」リンクの有無をチェック
          const nextPageLink = $('.pager-next a').attr('href');
          hasNextPage = !!nextPageLink;
          debugLog(`次のページのリンク: ${nextPageLink}, 続行: ${hasNextPage}`);
          
          currentPage++;
          
          // 連続リクエストを避けるための遅延
          debugLog(`1秒間の遅延を入れています...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error: unknown) {
          debugLog(`エラーが発生しました: ${error instanceof Error ? error.message : String(error)}`);
          console.error(`Error scraping ${pageUrl}: ${error instanceof Error ? error.message : String(error)}`);
          hasNextPage = false;
        }
      }
    }
    
    // 日付順にソート（新しい順）
    articles.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    debugLog(`スクレイピング完了。取得記事数: ${articles.length}`);
    debugLog(`取得記事リスト:`, articles.map(a => ({title: a.title, date: a.date})));
    
    return {
      articles,
      totalCount: articles.length,
      period: {
        startDate,
        endDate
      }
    };
  }
}); 