import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// 記事の型定義
type Article = {
  title: string;
  url: string;
  date: string;
  author?: string;
  summary?: string;
  categories?: string[];
};

export const formatBlogListTool = createTool({
  id: "format-blog-list",
  description: "ブログ記事の一覧を様々な形式に整形します",
  inputSchema: z.object({
    articles: z.array(z.object({
      title: z.string(),
      url: z.string(),
      date: z.string(),
      author: z.string().optional(),
      summary: z.string().optional(),
      categories: z.array(z.string()).optional()
    })),
    format: z.enum(["markdown", "html", "csv", "json"]).default("markdown"),
    includeCategories: z.boolean().optional().default(false),
    includeSummary: z.boolean().optional().default(false)
  }),
  execute: async ({ context }) => {
    const { articles, format, includeCategories = false, includeSummary = false } = context;
    
    // 日付順にソート（新しい順）
    const sortedArticles = [...articles].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
    
    switch (format) {
      case "markdown":
        return formatMarkdown(sortedArticles, includeCategories, includeSummary);
      case "html":
        return formatHtml(sortedArticles, includeCategories, includeSummary);
      case "csv":
        return formatCsv(sortedArticles, includeCategories, includeSummary);
      case "json":
        return { json: JSON.stringify(sortedArticles, null, 2) };
      default:
        return formatMarkdown(sortedArticles, includeCategories, includeSummary);
    }
  }
});

function formatMarkdown(articles: Article[], includeCategories: boolean, includeSummary: boolean) {
  let markdown = "# テコテックブログ 記事一覧\n\n";
  
  // テーブルヘッダー
  let header = "| 日付 | タイトル | 著者 ";
  if (includeCategories) header += "| カテゴリ ";
  if (includeSummary) header += "| 概要 ";
  header += "|\n";
  
  // ヘッダー区切り線
  let separator = "|------|---------|------|";
  if (includeCategories) separator += "------|";
  if (includeSummary) separator += "------|";
  separator += "\n";
  
  markdown += header + separator;
  
  // 記事行
  articles.forEach((article: Article) => {
    let row = `| ${article.date} | [${article.title}](${article.url}) | ${article.author || 'N/A'} `;
    
    if (includeCategories) {
      const categories = article.categories && article.categories.length > 0 
        ? article.categories.join(', ') 
        : 'N/A';
      row += `| ${categories} `;
    }
    
    if (includeSummary) {
      row += `| ${article.summary || 'N/A'} `;
    }
    
    row += "|\n";
    markdown += row;
  });
  
  return { markdown };
}

function formatHtml(articles: Article[], includeCategories: boolean, includeSummary: boolean) {
  let html = `
    <html>
    <head>
      <title>テコテックブログ 記事一覧</title>
      <style>
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        tr:hover { background-color: #f5f5f5; }
      </style>
    </head>
    <body>
      <h1>テコテックブログ 記事一覧</h1>
      <table>
        <thead>
          <tr>
            <th>日付</th>
            <th>タイトル</th>
            <th>著者</th>
            ${includeCategories ? '<th>カテゴリ</th>' : ''}
            ${includeSummary ? '<th>概要</th>' : ''}
          </tr>
        </thead>
        <tbody>
  `;
  
  articles.forEach((article: Article) => {
    html += `
      <tr>
        <td>${article.date}</td>
        <td><a href="${article.url}" target="_blank">${article.title}</a></td>
        <td>${article.author || 'N/A'}</td>
        ${includeCategories ? `<td>${(article.categories || []).join(', ') || 'N/A'}</td>` : ''}
        ${includeSummary ? `<td>${article.summary || 'N/A'}</td>` : ''}
      </tr>
    `;
  });
  
  html += `
        </tbody>
      </table>
    </body>
    </html>
  `;
  
  return { html };
}

function formatCsv(articles: Article[], includeCategories: boolean, includeSummary: boolean) {
  // ヘッダー行
  let csv = "日付,タイトル,URL,著者";
  if (includeCategories) csv += ",カテゴリ";
  if (includeSummary) csv += ",概要";
  csv += "\n";
  
  // データ行
  articles.forEach((article: Article) => {
    // CSVエスケープ処理
    const escapeCsv = (str: string | undefined) => {
      if (!str) return "";
      return `"${str.replace(/"/g, '""')}"`;
    };
    
    csv += `${article.date},${escapeCsv(article.title)},${article.url},${escapeCsv(article.author || '')}`;
    
    if (includeCategories) {
      const categories = article.categories && article.categories.length > 0 
        ? article.categories.join('; ') 
        : '';
      csv += `,${escapeCsv(categories)}`;
    }
    
    if (includeSummary) {
      csv += `,${escapeCsv(article.summary || '')}`;
    }
    
    csv += "\n";
  });
  
  return { csv };
} 