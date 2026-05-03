import { Fragment, ReactNode } from 'react';

// Çok hafif, güvenli markdown render. HTML enjeksiyonu yok.
// Destekler:
//   **bold**, *italic*, `code`
//   # Heading 1, ## Heading 2, ### Heading 3
//   [text](url) → güvenli http(s) link
//   - liste maddeleri
//   --- yatay çizgi
//   Otomatik URL linkleri (http://, https://)
//   Boş satır → paragraf, tek \n → <br />

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/g;

function safeHref(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

function renderInline(text: string, keyBase: string): ReactNode[] {
  // Markdown link [text](url) — önce parse, çünkü URL içinde * olabilir
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const parts: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = linkRe.exec(text)) !== null) {
    if (m.index > last) parts.push(...renderInlineNoLink(text.slice(last, m.index), `${keyBase}-pre-${i}`));
    const href = safeHref(m[2]);
    parts.push(
      <a key={`${keyBase}-link-${i}`} href={href ?? '#'} target="_blank" rel="noopener noreferrer" className="boardMdLink">
        {m[1]}
      </a>,
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(...renderInlineNoLink(text.slice(last), `${keyBase}-tail`));
  return parts;
}

function renderInlineNoLink(text: string, keyBase: string): ReactNode[] {
  // **bold** > *italic* > `code` > otomatik URL
  // Sırayla split-and-replace
  const tokens: { type: 'text' | 'bold' | 'italic' | 'code' | 'url'; value: string }[] = [];

  // Önce code (backtick) — içinde başka biçimlenme olmaz
  const codeSplit = text.split(/(`[^`]+`)/g);
  for (const seg of codeSplit) {
    if (seg.startsWith('`') && seg.endsWith('`') && seg.length > 2) {
      tokens.push({ type: 'code', value: seg.slice(1, -1) });
      continue;
    }
    // Sonra bold (**)
    const boldSplit = seg.split(/(\*\*[^*]+\*\*)/g);
    for (const bs of boldSplit) {
      if (bs.startsWith('**') && bs.endsWith('**') && bs.length > 4) {
        tokens.push({ type: 'bold', value: bs.slice(2, -2) });
        continue;
      }
      // Italic (*)
      const italicSplit = bs.split(/(\*[^*]+\*)/g);
      for (const is of italicSplit) {
        if (is.startsWith('*') && is.endsWith('*') && is.length > 2) {
          tokens.push({ type: 'italic', value: is.slice(1, -1) });
          continue;
        }
        // Otomatik URL
        const urlSplit = is.split(URL_RE);
        const urls = is.match(URL_RE) ?? [];
        for (let i = 0; i < urlSplit.length; i++) {
          if (urlSplit[i]) tokens.push({ type: 'text', value: urlSplit[i] });
          if (i < urls.length) tokens.push({ type: 'url', value: urls[i] });
        }
      }
    }
  }

  return tokens.map((t, idx) => {
    const k = `${keyBase}-${idx}`;
    if (t.type === 'bold') return <strong key={k}>{t.value}</strong>;
    if (t.type === 'italic') return <em key={k}>{t.value}</em>;
    if (t.type === 'code') return <code key={k} className="boardMdCode">{t.value}</code>;
    if (t.type === 'url') {
      const href = safeHref(t.value);
      return (
        <a key={k} href={href ?? '#'} target="_blank" rel="noopener noreferrer" className="boardMdLink">
          {t.value}
        </a>
      );
    }
    return <Fragment key={k}>{t.value}</Fragment>;
  });
}

export function renderMarkdown(source: string): ReactNode {
  if (!source) return null;
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let listBuf: string[] = [];
  let blockIdx = 0;

  function flushList() {
    if (listBuf.length === 0) return;
    const items = listBuf.slice();
    blocks.push(
      <ul key={`l-${blockIdx++}`} className="boardMdList">
        {items.map((it, i) => (
          <li key={i}>{renderInline(it, `li-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuf = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '---') {
      flushList();
      blocks.push(<hr key={`hr-${blockIdx++}`} className="boardMdHr" />);
      continue;
    }
    if (trimmed === '') {
      flushList();
      continue;
    }
    if (/^- /.test(trimmed)) {
      listBuf.push(trimmed.slice(2));
      continue;
    }
    flushList();
    if (trimmed.startsWith('### ')) {
      blocks.push(<h4 key={`h-${blockIdx++}`} className="boardMdH3">{renderInline(trimmed.slice(4), `h3-${blockIdx}`)}</h4>);
    } else if (trimmed.startsWith('## ')) {
      blocks.push(<h3 key={`h-${blockIdx++}`} className="boardMdH2">{renderInline(trimmed.slice(3), `h2-${blockIdx}`)}</h3>);
    } else if (trimmed.startsWith('# ')) {
      blocks.push(<h2 key={`h-${blockIdx++}`} className="boardMdH1">{renderInline(trimmed.slice(2), `h1-${blockIdx}`)}</h2>);
    } else {
      // Paragraf — sıradaki boş satıra kadar tek paragraf
      const paraLines: string[] = [line];
      while (i + 1 < lines.length && lines[i + 1].trim() !== '' && !/^(#{1,3} |- |---$)/.test(lines[i + 1].trim())) {
        i++;
        paraLines.push(lines[i]);
      }
      const para = paraLines.join('\n');
      const segments = para.split('\n');
      blocks.push(
        <p key={`p-${blockIdx++}`} className="boardMdP">
          {segments.map((s, idx) => (
            <Fragment key={idx}>
              {renderInline(s, `p-${idx}`)}
              {idx < segments.length - 1 && <br />}
            </Fragment>
          ))}
        </p>,
      );
    }
  }
  flushList();
  return <>{blocks}</>;
}
