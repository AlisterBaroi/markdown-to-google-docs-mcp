import { marked } from 'marked';

export interface StyleConfig {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  marginTop: number;
  marginBottom: number;
}

export interface ListStyleConfig extends StyleConfig {
  lastItemMarginBottom: number;
}

export interface DocSettings {
  title: StyleConfig;
  heading1: StyleConfig;
  body: StyleConfig;
  list: ListStyleConfig;
}

export const DEFAULT_SETTINGS: DocSettings = {
  title: { fontFamily: 'Arial', fontSize: 24, lineHeight: 1, marginTop: 0, marginBottom: 3 },
  heading1: { fontFamily: 'Arial', fontSize: 20, lineHeight: 1, marginTop: 20, marginBottom: 6 },
  body: { fontFamily: 'Arial', fontSize: 11, lineHeight: 1, marginTop: 0, marginBottom: 8 },
  list: { fontFamily: 'Arial', fontSize: 11, lineHeight: 1, marginTop: 0, marginBottom: 4, lastItemMarginBottom: 8 },
};

export const applyStylesToHtml = (html: string, settings: DocSettings): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const applyStyle = (el: HTMLElement, config: StyleConfig) => {
    el.style.fontFamily = config.fontFamily;
    el.style.fontSize = `${config.fontSize}pt`;
    el.style.lineHeight = `${config.lineHeight}`;
    el.style.marginTop = `${config.marginTop}pt`;
    el.style.marginBottom = `${config.marginBottom}pt`;
  };

  // Assume the first h1 is the title
  let foundTitle = false;
  
  // h1
  doc.querySelectorAll('h1').forEach(el => {
    if (!foundTitle) {
      applyStyle(el, settings.title);
      foundTitle = true;
    } else {
      applyStyle(el, settings.heading1);
    }
  });

  // h2, h3, h4, h5, h6 map to heading 1 as well just for fallback, 
  // or user just wanted heading 1. We'll map h2 to heading1.
  doc.querySelectorAll('h2').forEach(el => {
    applyStyle(el, settings.heading1);
  });

  // p
  doc.querySelectorAll('p').forEach(el => {
    applyStyle(el, settings.body);
  });

  // lists: ul, ol
  doc.querySelectorAll('ul, ol').forEach(listEl => {
    // We style the container to 0 margin optionally, but main spacing is in LI.
    (listEl as HTMLElement).style.marginTop = '0pt';
    (listEl as HTMLElement).style.marginBottom = '0pt';
    
    const items = listEl.querySelectorAll(':scope > li');
    items.forEach((li, index) => {
      const isLast = index === items.length - 1;
      const el = li as HTMLElement;
      el.style.fontFamily = settings.list.fontFamily;
      el.style.fontSize = `${settings.list.fontSize}pt`;
      el.style.lineHeight = `${settings.list.lineHeight}`;
      el.style.marginTop = `${settings.list.marginTop}pt`;
      el.style.marginBottom = `${isLast ? settings.list.lastItemMarginBottom : settings.list.marginBottom}pt`;
    });
  });

  return doc.body.innerHTML;
};

export const markdownToStyledHtml = async (markdown: string, settings: DocSettings): Promise<string> => {
  const rawHtml = await marked.parse(markdown);
  return applyStylesToHtml(rawHtml, settings);
};
