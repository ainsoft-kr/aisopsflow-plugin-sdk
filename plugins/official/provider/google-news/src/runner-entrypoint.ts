import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';
import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';

const parser = new XMLParser({ ignoreAttributes: false });

startStdioJsonRuntime({
  pluginName: 'google-news',
  version: '0.1.0',
  capabilities: ['news.google.rss.search', 'news.google.report.word_blocks', 'news.google.report.ppt_slides'],
  async handleInvoke({ capability, input }) {
    if (capability === 'news.google.rss.search') {
      return searchNews(input || {});
    }
    if (capability === 'news.google.report.word_blocks') {
      return buildWordBlocksReport(input || {});
    }
    if (capability === 'news.google.report.ppt_slides') {
      return buildPptSlidesReport(input || {});
    }
    fail(`unsupported capability: ${capability}`, 'unsupported_capability');
  }
});

async function searchNews(input: any) {
  const topic = optionalString(input?.topic, 'economy');
  const days = normalizeDays(input?.days, 7);
  const articles = await fetchArticles(topic, days);
  return { ok: true, topic, article_count: articles.length, articles };
}

async function buildWordBlocksReport(input: any) {
  const topic = optionalString(input?.topic, 'major incident');
  const articles = await fetchArticles(topic, 7);
  if (articles.length === 0) {
    fail('No recent incident articles found', 'provider_error');
  }
  const lead = mostCommonTitle(articles);
  const keywords = extractKeywords(articles.map((article) => article.title)).slice(0, 5);
  const blocks = [
    { type: 'heading', level: 1, text: 'Major Incident Analysis Report' },
    { type: 'paragraph', text: `Topic query: ${topic}` },
    { type: 'paragraph', text: `Most repeated headline: ${lead.title}` },
    { type: 'heading', level: 2, text: 'Executive Assessment' },
    {
      type: 'paragraph',
      text: 'This report identifies the most visible recent incident by clustering headlines returned by a public news feed.'
    },
    {
      type: 'paragraph',
      text: `The dominant incident theme is captured by the headline '${lead.title}', which appeared ${lead.count} times in the sampled set.`
    },
    { type: 'heading', level: 2, text: 'Representative Coverage' },
    { type: 'numbered_list', items: articles.slice(0, 8).map((article) => article.title) },
    { type: 'heading', level: 2, text: 'Analyst Notes' },
    {
      type: 'table',
      rows: [
        ['Dimension', 'Assessment'],
        ['Attention', `Coverage clustered around the lead incident with ${articles.length} sampled headlines.`],
        ['Narrative drivers', keywords.join(', ') || 'broad incident framing'],
        ['Risk view', 'Expect continued short-term discussion if official responses or secondary disclosures continue.']
      ]
    }
  ];
  return { ok: true, topic, blocks, blocks_json: JSON.stringify(blocks) };
}

async function buildPptSlidesReport(input: any) {
  const topic = optionalString(input?.topic, 'economy');
  const articles = await fetchArticles(topic, 7);
  if (articles.length === 0) {
    fail('No recent economic articles found in the last 7 days', 'provider_error');
  }
  const topTerms = extractKeywords(articles.map((article) => article.title)).slice(0, 6);
  const byDate = articles.reduce((acc: Record<string, number>, article: any) => {
    acc[article.date] = (acc[article.date] || 0) + 1;
    return acc;
  }, {});
  const peakDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
  const slides = [
    {
      title: 'Weekly Economic News Analysis',
      subtitle: `Topic: ${topic} | Articles analyzed: ${articles.length}`,
      bullets: [
        `Coverage volume peaked on ${peakDay?.[0] || 'n/a'} with ${peakDay?.[1] || 0} articles in the selected feed.`,
        `Headline language concentrated on ${(topTerms.slice(0, 3) || []).join(', ') || 'macroeconomic signals'}.`,
        'Repeated themes imply investors are reacting to policy, rates, and growth expectations rather than isolated company events.'
      ],
      notes: 'Executive summary generated from Google News RSS clustering.'
    },
    {
      title: 'Representative Headlines',
      bullets: articles.slice(0, 6).map((article) => `[${article.date}] ${article.title}`),
      notes: 'Top headlines from the sampled seven-day window.'
    },
    {
      title: 'Theme Frequency',
      bullets: topTerms.map((term, index) => `${term}: ${index + 1}`),
      notes: 'Recurring headline terms across the feed.'
    },
    {
      title: 'Daily Coverage Timeline',
      bullets: Object.keys(byDate).sort().map((day) => `${day}: ${'#'.repeat(byDate[day])} (${byDate[day]})`),
      notes: 'Article count by publication date.'
    }
  ];
  return { ok: true, topic, slides, slides_json: JSON.stringify(slides) };
}

async function fetchArticles(topic: string, days: number) {
  const url = `https://news.google.com/rss/search?${new URLSearchParams({
    q: `${topic} when:${days}d`,
    hl: 'en-US',
    gl: 'US',
    ceid: 'US:en'
  }).toString()}`;
  const response = await fetch(url);
  const xml = await response.text();
  if (!response.ok) {
    fail(`google news request failed with status ${response.status}`, 'provider_error');
  }
  const parsed: any = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list
    .map((item: any) => ({
      title: String(item?.title || '').replace(/\s+-\s+[^-]+$/, '').trim(),
      link: String(item?.link || '').trim(),
      date: normalizePubDate(item?.pubDate)
    }))
    .filter((article: any) => article.title && article.link);
}

function normalizePubDate(value: any) {
  const parsed = new Date(String(value || ''));
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return parsed.toISOString().slice(0, 10);
}

function mostCommonTitle(articles: any[]) {
  const counts = new Map<string, number>();
  for (const article of articles) {
    counts.set(article.title, (counts.get(article.title) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { title: sorted?.[0] || articles[0]?.title || '', count: sorted?.[1] || 1 };
}

function extractKeywords(titles: string[]) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'over', 'after', 'about', 'amid', 'near', 'than', 'have', 'has', 'will', 'are', 'its', 'their', 'your', 'was', 'were', 'but', 'not', 'you', 'his', 'her', 'she', 'him', 'our', 'out', 'new', 'why', 'how', 'what', 'who', 'where', 'when']);
  const counts = new Map<string, number>();
  for (const title of titles) {
    const words = String(title || '').toLowerCase().match(/[a-z][a-z-]{2,}/g) || [];
    for (const word of words) {
      if (stopWords.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word);
}

function optionalString(value: any, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeDays(value: any, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), 30);
}

function fail(message: string, code = 'runtime_error'): never {
  const error: any = new Error(message);
  error.code = code;
  throw error;
}
