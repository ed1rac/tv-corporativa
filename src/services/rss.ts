import Parser from 'rss-parser';

interface FeedCache {
  url: string;
  timestamp: number;
  items: Array<{ title: string; link: string; pubDate?: string }>;
}

let cachedFeed: FeedCache | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const parser = new Parser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; TVCorporativaSignage/2.0; +http://localhost)'
  }
});

export async function fetchRssFeed(feedUrl: string): Promise<Array<{ title: string; link: string; pubDate?: string }>> {
  const now = Date.now();

  if (cachedFeed && cachedFeed.url === feedUrl && now - cachedFeed.timestamp < CACHE_TTL_MS) {
    return cachedFeed.items;
  }

  try {
    const feed = await parser.parseURL(feedUrl);
    const items = (feed.items || []).slice(0, 15).map((item) => ({
      title: item.title || 'Sem título',
      link: item.link || '',
      pubDate: item.pubDate || ''
    }));

    cachedFeed = {
      url: feedUrl,
      timestamp: now,
      items
    };

    return items;
  } catch (err: any) {
    console.warn(`[RSS Service] Failed to fetch feed from ${feedUrl}: ${err.message}. Using fallback news.`);

    // Fallback news in case of internet failure or CORS/timeout
    return [
      { title: 'TV Corporativa: Bem-vindo ao sistema integrado de comunicação interna', link: '#' },
      { title: 'Fique atento aos comunicados oficiais da empresa no painel digital', link: '#' },
      { title: 'Prevenção e segurança: mantenha os corredores e saídas de emergência sempre livres', link: '#' },
      { title: 'Dúvidas e suporte técnico: acerte os detalhes com a equipe de TI no ramal 100', link: '#' }
    ];
  }
}
