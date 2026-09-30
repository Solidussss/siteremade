'use strict';
// Controlled Google Images result sets (the shape serpapi.googleImages returns) for two subjects the old one-search
// discovery handled badly: Super Smash Bros. Ultimate (a Nintendo game: the first search, "official render", is
// dominated by shopping results, figures and cosplay) and Neegy (an internet meme character: renders and promotional
// art do not exist; its pictures are meme images, many re-drawn by fans). Written for the tests, not copied from Google.
// Each set is keyed by the query FAMILY the discovery plan gives it.

const R = (n, o) => Object.assign({ position: n, width: 1600, height: 900, isProduct: false }, o);
const official = (slug, host, title, n, extra) => R(n, Object.assign({ title, pageUrl: `https://${host}/${slug}`, imageUrl: `https://${host}/img/${slug}.png`, thumbUrl: `https://thumbs.example.org/${host}/${slug}`, source: host }, extra || {}));
const shop = (n, title) => R(n, { title, pageUrl: `https://shop${n}.example.com/item`, imageUrl: `https://shop${n}.example.com/item.jpg`, thumbUrl: `https://thumbs.example.org/shop${n}`, source: 'Shop', isProduct: true });
const form = (n, title, host) => R(n, { title, pageUrl: `https://${host || `blog${n}.example.net`}/post`, imageUrl: `https://${host || `blog${n}.example.net`}/f${n}.jpg`, thumbUrl: `https://thumbs.example.org/form${n}`, source: host || 'Blog' });
const fan = (n, title, host) => R(n, { title, pageUrl: `https://${host}/art/${n}`, imageUrl: `https://images.${host}/art${n}.png`, thumbUrl: `https://thumbs.example.org/fan${n}`, source: host });

const SSBU = {
  name: 'Super Smash Bros. Ultimate',
  understanding: { kind: 'fictional', identity: { name: 'Super Smash Bros. Ultimate', kind: 'fictional', what: 'a 2018 crossover fighting video game by Nintendo' }, visuals: { main: 'the game\'s key art, its fighters mid-battle', depiction: 'artwork' }, research: { wikipediaTitles: ['Super Smash Bros. Ultimate'] }, pageTitle: 'Super Smash Bros. Ultimate' },
  results: {
    // "official render": mostly shopping, figures, amiibo and a cosplay -- only a few real renders
    render: [shop(1, 'Super Smash Bros Ultimate - Nintendo Switch'), shop(2, 'Smash Bros Ultimate Switch game'), form(3, 'Super Smash Bros Ultimate amiibo figure set'), form(4, 'Smash Ultimate Mario figure'), shop(5, 'Super Smash Bros Ultimate t-shirt'),
      form(6, 'Smash Bros Ultimate cosplay at the convention'), official('ssbu-mario-render', 'www.smashbros.com', 'Mario - Super Smash Bros. Ultimate official render', 7), shop(8, 'Super Smash Bros Ultimate poster for sale'), form(9, 'Super Smash Bros plush toys'),
      official('ssbu-link-render', 'ssb.wiki.gg', 'Link (SSBU) render - SmashWiki', 10), shop(11, 'SSBU Pro Controller'), form(12, 'Smash Ultimate keychain merch')],
    // "key art": the game's promotional art, mostly on official and press sites
    'key-art': [official('ssbu-key-art', 'www.nintendo.com', 'Super Smash Bros. Ultimate key art', 1), official('ssbu-everyone-is-here', 'www.smashbros.com', 'Everyone is here! Super Smash Bros. Ultimate', 2),
      official('ssbu-banner', 'press.nintendo.com', 'Super Smash Bros. Ultimate press banner', 3), official('ssbu-boxart', 'www.ign.com', 'Super Smash Bros. Ultimate box art revealed', 4),
      official('ssbu-cover', 'www.gamespot.com', 'Super Smash Bros Ultimate cover art', 5), official('ssbu-wallpaper', 'www.nintendolife.com', 'Super Smash Bros. Ultimate wallpaper', 6),
      official('ssbu-kv2', 'www.polygon.com', 'Smash Ultimate key visual', 7), fan(8, 'Smash Ultimate fan poster', 'www.deviantart.com'), official('ssbu-kv3', 'www.theverge.com', 'Super Smash Bros Ultimate artwork', 9)],
    // "gameplay screenshot"
    screenshot: [official('ssbu-shot-1', 'www.nintendo.com', 'Super Smash Bros. Ultimate screenshot', 1), official('ssbu-shot-2', 'www.eurogamer.net', 'Smash Ultimate gameplay screenshot', 2), official('ssbu-shot-3', 'www.ign.com', 'Super Smash Bros Ultimate stage screenshot', 3),
      official('ssbu-shot-4', 'www.gamesradar.com', 'Super Smash Bros. Ultimate battle', 4), official('ssbu-shot-5', 'www.nintendolife.com', 'Smash Ultimate screenshot', 5), official('ssbu-shot-6', 'www.vg247.com', 'Super Smash Bros Ultimate gameplay', 6)],
  },
};

const NEEGY = {
  name: 'Neegy',
  understanding: { kind: 'fictional', identity: { name: 'Neegy', kind: 'fictional', what: 'an internet meme character' }, visuals: { main: 'the Neegy character itself', depiction: 'artwork' }, research: { wikipediaTitles: [] }, pageTitle: '' },
  results: {
    // "meme": the character's meme images on meme sites -- a real, relevant result set
    meme: [official('neegy-original', 'knowyourmeme.com', 'Neegy | Know Your Meme', 1), official('neegy-2', 'i.imgflip.com', 'Neegy meme', 2), official('neegy-3', 'www.reddit.com', 'Neegy meme compilation', 3),
      official('neegy-4', 'tenor.com', 'Neegy GIF', 4), official('neegy-5', 'knowyourmeme.com', 'Neegy - image gallery', 5), official('neegy-6', 'x.com', 'neegy', 6), official('neegy-7', 'www.tiktok.com', 'Neegy meme explained', 7)],
    // "character image": mostly re-drawings on art-community sites (fan-made)
    character: [fan(1, 'Neegy fanart', 'www.deviantart.com'), fan(2, 'Neegy character', 'someone.artstation.com'), fan(3, 'neegy redraw', 'www.newgrounds.com'), official('neegy-8', 'knowyourmeme.com', 'Neegy character', 4), fan(5, 'Neegy drawing', 'www.pixiv.net')],
    original: [official('neegy-orig-1', 'knowyourmeme.com', 'Neegy original image', 1), official('neegy-orig-2', 'www.reddit.com', 'The original Neegy', 2)],
  },
};

// a search function over a fixture: the result set for the query's family (by its words), counting every call
function fakeSearch(fx, opts) {
  const o = opts || {}; const calls = [];
  const fn = async (q, licenses) => {
    calls.push(q);
    if (o.fail) return { ok: false, status: o.fail, results: [], error: `SerpApi returned ${o.fail}` };
    const fam = Object.keys(fx.results).find(k => new RegExp(`\\b${({ render: 'official render', 'key-art': 'key art', screenshot: 'gameplay screenshot', meme: 'meme(?! template)', character: 'character image', original: 'original image' })[k] || k}\\b`, 'i').test(q.replace(/ -\S+/g, '')));
    return { ok: true, status: 200, results: fam ? fx.results[fam].map(x => Object.assign({}, x)) : [], error: '' };
  };
  fn.calls = calls; return fn;
}

module.exports = { SSBU, NEEGY, fakeSearch };
