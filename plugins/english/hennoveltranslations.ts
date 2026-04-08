import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';
import { load as loadCheerio } from 'cheerio';
import { defaultCover } from '@libs/defaultCover';
import { NovelStatus } from '@libs/novelStatus';

class HennovelTranslations implements Plugin.PluginBase {
  id = 'hennoveltranslations';
  name = 'hennoveltranslations';
  icon = 'src/en/hennoveltranslations/icon.png';
  site = 'https://hennoveltranslations.com';
  version = '1.0.0';

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    const response = await fetchApi(this.site);
    const body = await response.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];

    $('.book-item-feature').each((_, el) => {
      const titleEl = $(el).find('.book-title a');
      const name = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      const cover =
        $(el).find('.book-image-container img').attr('src') || defaultCover;

      if (name && href) {
        novels.push({
          name,
          path: href.replace(this.site, ''),
          cover,
        });
      }
    });

    return novels;
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = this.site + novelPath;
    const response = await fetchApi(url);
    const body = await response.text();
    const $ = loadCheerio(body);

    // Title
    const name = $('.single-novel-title h1').text().trim() || 'Untitled';

    // Status — the strong tag reads e.g. "Status: Ongoing" or "Status: Completed"
    const statusText = $('.single-novel-title p strong').first().text().trim();
    const status = statusText.toLowerCase().includes('completed')
      ? NovelStatus.Completed
      : NovelStatus.Ongoing;

    // Cover — prefer OG image meta tag, fall back to first img in novel-content
    const cover =
      $('meta[property="og:image"]').attr('content') ||
      $('.novel-content p img').first().attr('src') ||
      defaultCover;

    // Summary — the description text sits as a raw text node directly after
    // the <h2>Description:</h2> element and before the .alternate-chapters div.
    const customFieldsHtml = $('.custom-fields').html() || '';
    const descMatch = customFieldsHtml.match(/<\/h2>([\s\S]*?)<div/);
    const summary = descMatch ? descMatch[1].trim() : '';

    // Author & Genre — live inside <p><strong>Label:</strong> value</p> tags
    let author = '';
    let genres = '';

    $('.custom-fields p').each((_, el) => {
      const label = $(el).find('strong').first().text().trim();
      const fullText = $(el).text().trim();

      if (label === 'Author:') {
        author = fullText.replace('Author:', '').trim();
      } else if (label === 'Genre:') {
        // Site formats genre as "Genre: Genre- Action, Fantasy, …"
        genres = fullText
          .replace('Genre:', '')
          .replace(/^[\s-]*Genre-\s*/i, '')
          .trim();
      }
    });

    // Chapters — free chapters are in <ul class="episode-list2">
    // They appear newest-first on the page; we reverse to oldest-first.
    const chapters: Plugin.ChapterItem[] = [];

    $('ul.episode-list2 li').each((i, el) => {
      const a = $(el).find('a');
      const chapterName = a.text().trim();
      const href = a.attr('href') || '';
      const releaseTime = $(el).find('.episode-time-single').text().trim();

      if (href && chapterName) {
        const chapterPath = href.replace(this.site, '');
        const numMatch = chapterName.match(/(\d+(?:\.\d+)?)/);
        const chapterNumber = numMatch ? parseFloat(numMatch[1]) : i + 1;

        chapters.push({
          name: chapterName,
          path: chapterPath,
          releaseTime,
          chapterNumber,
        });
      }
    });

    // Reverse so index 0 is the earliest chapter
    chapters.reverse();

    return {
      path: novelPath,
      name,
      cover,
      summary,
      author,
      genres,
      status,
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const url = this.site + chapterPath;
    const response = await fetchApi(url);
    const body = await response.text();
    const $ = loadCheerio(body);

    // Chapter content lives inside .episode-content
    const content = $('.episode-content').html();
    if (!content) return '<p>Chapter content could not be loaded.</p>';

    return content;
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    // WordPress pagination via ?paged=N; page 1 uses the base URL
    const page = pageNo > 1 ? `&paged=${pageNo}` : '';
    const url = `${this.site}/?s=${encodeURIComponent(searchTerm)}&post_type=novels${page}`;

    const response = await fetchApi(url);
    const body = await response.text();
    const $ = loadCheerio(body);

    const novels: Plugin.NovelItem[] = [];

    $('article').each((_, el) => {
      const titleEl = $(el).find('.entry-title a');
      const name = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      const cover =
        $(el).find('.post-image img').attr('src') ||
        $(el).find('img').first().attr('src') ||
        defaultCover;

      if (name && href) {
        novels.push({
          name,
          path: href.replace(this.site, ''),
          cover,
        });
      }
    });

    return novels;
  }

  resolveUrl = (path: string) => this.site + path;
}

export default new HennovelTranslations();
