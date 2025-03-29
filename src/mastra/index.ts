import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';

import { weatherAgent } from './agents';
import { tecotecBlogAgent } from "./agents/tecotecBlogAgent";

export const mastra = new Mastra({
  agents: { weatherAgent, tecotecBlogAgent },
  logger: createLogger({
    name: 'Mastra',
    level: 'info',
  }),
});
