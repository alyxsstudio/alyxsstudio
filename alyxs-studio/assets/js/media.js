/* Alyx's Studio — turns a pasted link into a player.
   YouTube, TikTok, Instagram, Bilibili, Douyin, Vimeo, Spotify, Apple Music, Apple Podcasts,
   SoundCloud, Bandcamp, NetEase Cloud Music, and plain audio / video files.
   Used by the website (Watch, Listen, Daily) and by the on-page editor for its live preview. */
(function () {
  "use strict";

  function U(u) { try { return new URL(String(u || "").trim()); } catch (e) { return null; } }
  function host(u) { return u.hostname.replace(/^(www|m|mobile|music|open|embed)\./, "").toLowerCase(); }
  var ALLOW = "autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write; web-share";
  var AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)(\?|#|$)/i;
  var VIDEO_EXT = /\.(mp4|m4v|mov|webm)(\?|#|$)/i;

  /* Returns what we know about a link without asking anyone:
     { platform, type: video | short | audio | card, shelf: watch | listen, category, src, auto, ratio, height, thumb, file } */
  function parse(raw, meta) {
    meta = meta || {};
    var url = meta.url || raw;
    if (/^\//.test(String(url))) url = location.origin + url; // a file uploaded to this site
    var u = U(url);
    var r = { url: raw, platform: "", type: "card", shelf: "watch", category: "Video", src: "", auto: "", ratio: "16 / 9", height: 0, thumb: meta.cover || "", file: "" };
    if (!u) return r;
    var h = host(u), p = u.pathname, q = u.searchParams, m;
    r.platform = h.replace(/\.(com|net|tv|fm|cn)$/, "");

    // plain files (also files uploaded to this site)
    if (/^\/assets\/uploads\//.test(p) || AUDIO_EXT.test(p) || VIDEO_EXT.test(p)) {
      var isVideo = /\.(mp4|m4v|mov)(\?|#|$)/i.test(p);
      r.platform = ""; r.file = raw;
      if (isVideo) { r.type = "video"; r.category = "Video"; }
      else { r.type = "audio"; r.shelf = "listen"; r.category = "Music"; }
      return r;
    }

    // YouTube (and YouTube Music)
    if (h === "youtube.com" || h === "youtu.be" || h === "youtube-nocookie.com") {
      var id = "";
      if (/youtu\.be$/.test(u.hostname)) id = p.slice(1).split("/")[0];
      else if ((m = p.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/))) { id = m[2]; if (m[1] === "shorts") r.type = "short"; }
      else id = q.get("v") || "";
      var list = q.get("list");
      r.platform = "YouTube";
      if (/^music\./.test(u.hostname)) { r.platform = "YouTube Music"; r.shelf = "listen"; r.category = "Music"; }
      if (!id && list) {
        r.type = "video";
        r.src = "https://www.youtube-nocookie.com/embed/videoseries?list=" + encodeURIComponent(list) + "&rel=0";
        r.auto = r.src + "&autoplay=1&mute=1&playsinline=1";
        return r;
      }
      if (!id) return r;
      if (r.type !== "short") r.type = "video";
      if (r.type === "short") r.ratio = "9 / 16";
      var t = parseInt(q.get("t") || q.get("start") || "", 10);
      var base = "https://www.youtube-nocookie.com/embed/" + id + "?rel=0&playsinline=1" + (t ? "&start=" + t : "");
      r.src = base + "&autoplay=1";
      r.auto = base + "&autoplay=1&mute=1&loop=1&playlist=" + id;
      r.thumb = r.thumb || "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
      return r;
    }
    // Vimeo
    if (h === "vimeo.com" || h === "player.vimeo.com") {
      m = p.match(/(\d{5,})/);
      if (!m) return r;
      r.platform = "Vimeo"; r.type = "video";
      var hsh = (p.match(/\/\d{5,}\/([0-9a-f]{6,})/) || [])[1] || q.get("h");
      var vb = "https://player.vimeo.com/video/" + m[1] + "?dnt=1" + (hsh ? "&h=" + hsh : "");
      r.src = vb + "&autoplay=1"; r.auto = vb + "&autoplay=1&muted=1&loop=1";
      return r;
    }
    // TikTok
    if (/tiktok\.com$/.test(h)) {
      r.platform = "TikTok"; r.type = "short"; r.ratio = "9 / 16";
      m = p.match(/\/video\/(\d+)/) || p.match(/\/(?:embed\/v2|player\/v1)\/(\d+)/) || (meta.id ? [0, meta.id] : null);
      if (!m) { r.type = "card"; return r; }
      var tb = "https://www.tiktok.com/player/v1/" + m[1] + "?music_info=1&description=1&rel=0&loop=1";
      r.src = tb + "&autoplay=1"; r.auto = tb + "&autoplay=1";
      return r;
    }
    // Instagram posts and reels
    if (h === "instagram.com") {
      m = p.match(/^\/(?:[\w.]+\/)?(p|reel|reels|tv)\/([\w-]+)/);
      r.platform = "Instagram";
      if (!m) return r;
      r.type = "short"; r.ratio = m[1] === "p" ? "4 / 5.6" : "9 / 16";
      r.src = "https://www.instagram.com/" + (m[1] === "reels" ? "reel" : m[1]) + "/" + m[2] + "/embed/";
      return r;
    }
    // Bilibili
    if (/bilibili\.com$/.test(h)) {
      r.platform = "Bilibili";
      m = p.match(/\/video\/(BV[\w]+|av\d+)/i);
      if (!m) return r;
      r.type = "video";
      var bid = /^av/i.test(m[1]) ? "aid=" + m[1].slice(2) : "bvid=" + m[1];
      var page = q.get("p") ? "&p=" + q.get("p") : "";
      r.src = "https://player.bilibili.com/player.html?" + bid + page + "&high_quality=1&danmaku=0&autoplay=1";
      return r;
    }
    // Douyin
    if (/douyin\.com$/.test(h)) {
      r.platform = "Douyin";
      m = p.match(/\/video\/(\d+)/) || (q.get("modal_id") ? [0, q.get("modal_id")] : null);
      if (!m) return r;
      r.type = "short"; r.ratio = "9 / 16";
      r.src = "https://open.douyin.com/player/video?vid=" + m[1] + "&autoplay=0";
      return r;
    }
    // Spotify
    if (h === "spotify.com") {
      m = p.match(/\/(track|album|playlist|episode|show|artist)\/([\w]+)/);
      r.platform = "Spotify"; r.shelf = "listen";
      if (!m) return r;
      r.type = "audio"; r.category = /episode|show/.test(m[1]) ? "Podcasts" : "Music";
      r.src = "https://open.spotify.com/embed/" + m[1] + "/" + m[2] + "?utm_source=generator";
      r.height = /track|episode/.test(m[1]) ? 152 : 352;
      return r;
    }
    // Apple Music / iTunes
    if (/^(music\.apple\.com|itunes\.apple\.com|embed\.music\.apple\.com)$/.test(u.hostname)) {
      r.platform = "Apple Music"; r.shelf = "listen"; r.category = "Music"; r.type = "audio";
      if (/\/podcast\//.test(p)) { r.platform = "Apple Podcasts"; r.category = "Podcasts"; }
      var single = q.get("i") || /\/song\//.test(p);
      r.src = "https://embed." + (r.category === "Podcasts" ? "podcasts" : "music") + ".apple.com" + p + u.search;
      r.height = single ? 175 : 450;
      return r;
    }
    // Apple Podcasts
    if (/^(embed\.)?podcasts\.apple\.com$/.test(u.hostname)) {
      r.platform = "Apple Podcasts"; r.shelf = "listen"; r.category = "Podcasts"; r.type = "audio";
      r.src = "https://embed.podcasts.apple.com" + p + u.search;
      r.height = q.get("i") ? 175 : 450;
      return r;
    }
    // SoundCloud
    if (h === "soundcloud.com" || h === "on.soundcloud.com") {
      r.platform = "SoundCloud"; r.shelf = "listen"; r.category = "Music";
      if (h === "on.soundcloud.com" && !meta.url) return r; // short link: the publish step finds the full one
      r.type = "audio";
      r.src = "https://w.soundcloud.com/player/?url=" + encodeURIComponent(url) + "&color=%23111111&auto_play=false&hide_related=true&show_comments=false&show_reposts=false&visual=false";
      r.height = /\/sets\//.test(p) ? 400 : 166;
      return r;
    }
    // Bandcamp (the player address is found when publishing)
    if (/bandcamp\.com$/.test(h)) {
      r.platform = "Bandcamp"; r.shelf = "listen"; r.category = "Music";
      if (meta.embed && /bandcamp\.com\/EmbeddedPlayer/.test(meta.embed)) {
        r.type = "audio"; r.height = 120;
        r.src = meta.embed.replace(/\/?$/, "/").replace(/size=\w+\//, "") + "size=large/bgcol=ffffff/linkcol=111111/tracklist=false/artwork=small/transparent=true/";
      }
      return r;
    }
    // NetEase Cloud Music 网易云音乐
    if (/^(y\.)?music\.163\.com$/.test(u.hostname)) {
      var hashQ = u.hash.indexOf("?") > -1 ? new URLSearchParams(u.hash.split("?")[1]) : null;
      var full = (u.hash.replace(/^#/, "").split("?")[0] || "") + p;
      var nid = q.get("id") || (hashQ && hashQ.get("id")) || (full.match(/\/(?:song|album|playlist)\/(\d+)/) || [])[1];
      r.platform = "NetEase Music"; r.shelf = "listen"; r.category = "Music";
      if (!nid) return r;
      var kind = /playlist/.test(full) ? 0 : /album/.test(full) ? 1 : /djradio|program/.test(full) ? 3 : 2;
      r.type = "audio"; r.height = kind === 2 || kind === 3 ? 86 : 450;
      r.src = "https://music.163.com/outchain/player?type=" + kind + "&id=" + nid + "&auto=0&height=" + (r.height - 20);
      return r;
    }
    // Xiaoyuzhou 小宇宙 and anything else: a card; if the page offers its audio or video, play that
    if (/xiaoyuzhoufm\.com$/.test(h)) { r.platform = "Xiaoyuzhou"; r.shelf = "listen"; r.category = "Podcasts"; }
    if (/xiaohongshu\.com$|xhslink\.com$/.test(h)) r.platform = "RedNote";
    if (/weibo\.(com|cn)$/.test(h)) r.platform = "Weibo";
    if (/^(x|twitter)\.com$/.test(h)) r.platform = "X";
    if (meta.audio) { r.type = "audio"; r.file = meta.audio; r.shelf = "listen"; if (r.category === "Video") r.category = "Music"; }
    else if (meta.video) { r.type = "video"; r.file = meta.video; }
    r.platform = r.platform.charAt(0).toUpperCase() + r.platform.slice(1);
    return r;
  }

  function looksLikeLink(s) { return /^https?:\/\/\S+\.\S+/.test(String(s || "").trim()); }

  window.AlyxMedia = { parse: parse, looksLikeLink: looksLikeLink, ALLOW: ALLOW };
})();
