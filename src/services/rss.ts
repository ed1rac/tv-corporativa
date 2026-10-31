import Parser from 'rss-parser';

interface FeedCache {
  url: string;
  timestamp: number;
  items: Array<{ title: string; link: string; pubDate?: string }>;
}

let cachedFeed: FeedCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const parser = new Parser();

export function clearRssCache(): void {
  cachedFeed = null;
}

export async function fetchRssFeed(feedUrl: string): Promise<Array<{ title: string; link: string; pubDate?: string }>> {
  const now = Date.now();

  if (cachedFeed && cachedFeed.url === feedUrl && now - cachedFeed.timestamp < CACHE_TTL_MS) {
    return cachedFeed.items;
  }

  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rawText = await response.text();
    // Strip BOM and any leading characters before first '<'
    const firstTagIdx = rawText.indexOf('<');
    const cleanXml = firstTagIdx >= 0 ? rawText.slice(firstTagIdx).trim() : rawText.trim();

    const feed = await parser.parseString(cleanXml);
    const items = (feed.items || []).slice(0, 15).map((item) => ({
      title: (item.title || 'Sem título').replace(/\s+/g, ' ').trim(),
      link: item.link || '',
      pubDate: item.pubDate || ''
    }));

    if (items.length === 0) {
      throw new Error('Feed retornou 0 itens');
    }

    cachedFeed = {
      url: feedUrl,
      timestamp: now,
      items
    };

    return items;
  } catch (err: any) {
    console.warn(`[RSS Service] Failed to fetch feed from ${feedUrl}: ${err.message}. Using fallback news.`);

    return [
      { title: 'TV Corporativa: Bem-vindo ao sistema integrado de comunicação interna e atendimento', link: '#' },
      { title: 'Fique atento aos comunicados oficiais e avisos da empresa no painel digital', link: '#' },
      { title: 'Prevenção e saúde: mantenha seus exames e consultas em dia', link: '#' },
      { title: 'Dúvidas e suporte técnico: acerte os detalhes com a equipe de atendimento', link: '#' }
    ];
  }
}
