/* Alyx's Studio — the private journal on the Feed calendar.
   Only for the owner. Food, drinks, water, bathroom, period, mood, money, notes and computer time
   are kept in the private repository (alyxsstudio/studio-drafts → journal/), never on the website. */
(function () {
  "use strict";
  var E = function () { return window.AlyxEditor; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function r1(n) { return Math.round((+n || 0) * 10) / 10; }
  function r0(n) { return Math.round(+n || 0); }
  function nowTime() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function addDays(day, n) { var p = day.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2] + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function diffDays(a, b) { var pa = a.split("-"), pb = b.split("-"); return Math.round((new Date(+pb[0], +pb[1] - 1, +pb[2]) - new Date(+pa[0], +pa[1] - 1, +pa[2])) / 864e5); }
  function today() { var t = new Date(); return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()); }
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function nice(day) { var p = day.split("-"); return MON[+p[1] - 1] + " " + (+p[2]); }

  /* ---------- common foods, one usual portion each (approximate) ----------
     [Chinese, English, portion, kcal, protein g, carbs g, fat g, fibre g, vegetable servings] */
  var FOODS = [
    ["米饭", "Rice", "1 bowl", 195, 4, 43, 0.4, 0.6, 0], ["糙米饭", "Brown rice", "1 bowl", 165, 3.8, 34, 1.3, 2.7, 0],
    ["粥", "Rice porridge", "1 bowl", 120, 2.5, 26, 0.3, 0.3, 0], ["馒头", "Steamed bun", "1", 223, 7, 47, 1, 1.3, 0],
    ["包子", "Baozi", "1", 230, 9, 30, 8, 1, 0.2], ["饺子", "Dumplings", "10", 420, 18, 50, 16, 2, 0.3],
    ["面条", "Noodles", "1 bowl", 276, 9, 56, 1.4, 2, 0], ["牛肉面", "Beef noodle soup", "1 bowl", 550, 28, 70, 15, 3, 0.3],
    ["拉面", "Ramen", "1 bowl", 550, 22, 70, 20, 3, 0.3], ["方便面", "Instant noodles", "1 pack", 450, 9, 60, 19, 2, 0],
    ["炒饭", "Fried rice", "1 plate", 520, 14, 70, 20, 2, 0.5], ["麻辣烫", "Malatang", "1 bowl", 450, 20, 40, 22, 5, 2],
    ["火锅", "Hotpot", "1 meal", 800, 40, 50, 45, 6, 2], ["番茄炒蛋", "Tomato & egg", "1 plate", 250, 12, 9, 18, 1.5, 1],
    ["炒青菜", "Stir-fried greens", "1 plate", 90, 3, 6, 6, 3, 2], ["宫保鸡丁", "Kung pao chicken", "1 plate", 430, 30, 15, 28, 2, 0.5],
    ["麻婆豆腐", "Mapo tofu", "1 plate", 330, 18, 10, 24, 1.5, 0.2], ["红烧肉", "Braised pork", "1 plate", 600, 20, 12, 52, 0, 0],
    ["粽子", "Zongzi", "1", 300, 8, 50, 7, 1, 0], ["月饼", "Mooncake", "1", 420, 7, 55, 20, 2, 0],
    ["面包", "White bread", "1 slice", 75, 2.6, 14, 1, 0.7, 0], ["全麦面包", "Wholewheat bread", "1 slice", 80, 4, 14, 1, 2, 0],
    ["燕麦", "Oatmeal", "40 g dry", 150, 5, 27, 3, 4, 0], ["麦片", "Cereal", "1 bowl", 150, 3, 33, 1.5, 2, 0],
    ["贝果", "Bagel", "1", 270, 10, 53, 1.5, 2, 0], ["可颂", "Croissant", "1", 230, 5, 26, 12, 1.5, 0],
    ["鸡蛋", "Egg, boiled", "1", 72, 6.3, 0.4, 4.8, 0, 0], ["煎蛋", "Egg, fried", "1", 90, 6.3, 0.4, 7, 0, 0],
    ["牛奶", "Milk", "250 ml", 150, 8, 12, 8, 0, 0], ["豆浆", "Soy milk", "250 ml", 100, 8, 6, 4.5, 1, 0],
    ["酸奶", "Yogurt", "150 g", 140, 6, 18, 4.5, 0, 0], ["希腊酸奶", "Greek yogurt", "150 g", 130, 15, 6, 5, 0, 0],
    ["奶酪", "Cheese", "30 g", 110, 7, 0.4, 9, 0, 0], ["豆腐", "Tofu", "150 g", 115, 12, 3, 7, 1.5, 0],
    ["鸡胸肉", "Chicken breast", "100 g", 165, 31, 0, 3.6, 0, 0], ["鸡腿", "Chicken thigh", "100 g", 210, 26, 0, 11, 0, 0],
    ["炸鸡", "Fried chicken", "2 pieces", 500, 35, 16, 32, 1, 0], ["牛肉", "Beef", "100 g", 250, 26, 0, 15, 0, 0],
    ["牛排", "Steak", "200 g", 500, 50, 0, 32, 0, 0], ["猪肉", "Pork", "100 g", 240, 27, 0, 14, 0, 0],
    ["五花肉", "Pork belly", "100 g", 520, 9, 0, 53, 0, 0], ["培根", "Bacon", "2 slices", 90, 6, 0, 7, 0, 0],
    ["香肠", "Sausage", "1", 180, 7, 2, 16, 0, 0], ["三文鱼", "Salmon", "100 g", 208, 20, 0, 13, 0, 0],
    ["鱼", "White fish", "100 g", 110, 23, 0, 1.5, 0, 0], ["虾", "Shrimp", "100 g", 99, 24, 0.2, 0.3, 0, 0],
    ["金枪鱼", "Tuna", "1 can", 120, 26, 0, 1, 0, 0], ["寿司", "Sushi", "6 pieces", 300, 12, 50, 5, 1.5, 0.2],
    ["三明治", "Sandwich", "1", 350, 18, 35, 14, 3, 0.5], ["汉堡", "Burger", "1", 500, 25, 40, 25, 2, 0.3],
    ["披萨", "Pizza", "1 slice", 285, 12, 36, 10, 2.5, 0.2], ["薯条", "Fries", "medium", 365, 4, 48, 17, 4, 0],
    ["卷饼", "Burrito", "1", 650, 25, 80, 22, 10, 0.5], ["意面", "Pasta", "1 plate", 450, 15, 75, 10, 4, 0.5],
    ["沙拉", "Green salad", "1 bowl", 30, 2, 5, 0.3, 2, 2], ["沙拉酱", "Dressing", "1 tbsp", 70, 0, 2, 7, 0, 0],
    ["西兰花", "Broccoli", "100 g", 35, 2.8, 7, 0.4, 2.6, 1.3], ["菠菜", "Spinach, cooked", "100 g", 23, 3, 3.8, 0.3, 2.4, 1.5],
    ["黄瓜", "Cucumber", "1", 30, 1.3, 7, 0.2, 1, 1], ["番茄", "Tomato", "1", 22, 1, 5, 0.2, 1.5, 1],
    ["胡萝卜", "Carrot", "1", 25, 0.6, 6, 0.1, 1.7, 1], ["蘑菇", "Mushrooms", "100 g", 22, 3, 3.3, 0.3, 1, 1],
    ["生菜", "Lettuce", "1 bowl", 10, 1, 2, 0.1, 1, 1], ["青椒", "Bell pepper", "1", 30, 1, 7, 0.3, 2.5, 1],
    ["玉米", "Corn", "1 cob", 90, 3.3, 19, 1.4, 2, 0.5], ["红薯", "Sweet potato", "1", 130, 2.4, 30, 0.2, 4.5, 1],
    ["土豆", "Potato", "1", 115, 3, 26, 0.1, 3, 0.5], ["毛豆", "Edamame", "1 cup", 190, 17, 14, 8, 8, 1],
    ["苹果", "Apple", "1", 95, 0.5, 25, 0.3, 4.4, 0], ["香蕉", "Banana", "1", 105, 1.3, 27, 0.4, 3.1, 0],
    ["橙子", "Orange", "1", 62, 1.2, 15, 0.2, 3.1, 0], ["葡萄", "Grapes", "1 cup", 104, 1.1, 27, 0.2, 1.4, 0],
    ["草莓", "Strawberries", "1 cup", 50, 1, 12, 0.5, 3, 0], ["蓝莓", "Blueberries", "1 cup", 84, 1.1, 21, 0.5, 3.6, 0],
    ["西瓜", "Watermelon", "2 cups", 90, 1.8, 23, 0.5, 1.2, 0], ["牛油果", "Avocado", "half", 160, 2, 8.5, 15, 6.7, 0],
    ["坚果", "Nuts", "30 g", 175, 6, 6, 15, 3, 0], ["花生酱", "Peanut butter", "2 tbsp", 190, 7, 7, 16, 2, 0],
    ["蛋白棒", "Protein bar", "1", 200, 20, 22, 7, 3, 0], ["薯片", "Crisps", "30 g", 160, 2, 15, 10, 1, 0],
    ["巧克力", "Chocolate", "30 g", 160, 2, 17, 9, 2, 0], ["饼干", "Cookies", "2", 150, 2, 20, 7, 0.5, 0],
    ["蛋糕", "Cake", "1 slice", 350, 4, 50, 15, 1, 0], ["冰淇淋", "Ice cream", "1 scoop", 140, 2.5, 16, 7, 0.5, 0],
    ["甜甜圈", "Doughnut", "1", 250, 3, 30, 14, 1, 0]
  ];
  /* [Chinese, English, ml, kcal, protein, carbs, fat] */
  var DRINKS = [
    ["咖啡", "Coffee", 250, 2, 0.3, 0, 0], ["美式", "Americano", 350, 10, 0.5, 1.5, 0], ["拿铁", "Latte", 350, 190, 10, 15, 9],
    ["茶", "Tea", 250, 2, 0, 0.5, 0], ["奶茶", "Bubble tea", 500, 400, 4, 70, 12], ["果汁", "Juice", 250, 112, 1.7, 26, 0.5],
    ["可乐", "Cola", 330, 140, 0, 35, 0], ["无糖可乐", "Diet cola", 330, 1, 0, 0, 0], ["气泡水", "Sparkling water", 330, 0, 0, 0, 0],
    ["啤酒", "Beer", 330, 150, 1.6, 13, 0], ["红酒", "Wine", 150, 125, 0.1, 4, 0], ["运动饮料", "Sports drink", 500, 130, 0, 34, 0],
    ["椰子水", "Coconut water", 330, 60, 0.7, 15, 0], ["热巧克力", "Hot chocolate", 250, 190, 7, 27, 6]
  ];
  var MOODS = ["😄", "🙂", "😐", "😔", "😢", "😠", "😴", "🤒"];
  var FLOW = [["", "None"], ["spotting", "Spotting"], ["light", "Light"], ["medium", "Medium"], ["heavy", "Heavy"]];
  var DEFAULTS = { targets: { kcal: 2000, protein: 60, carbs: 250, fat: 70, fiber: 25, veg: 5, water: 8 }, currency: "$",
    spend_cats: ["Shopping", "Food", "Transport", "Home", "Books", "Beauty", "Health", "Other"], my_foods: [], gemini_key: "" };

  /* ---------- storage: one file per month, plus settings ---------- */
  var S = { months: {}, sha: {}, loading: {}, settings: null, settingsSha: null, activity: {}, timers: {}, ctx: null, status: "", failed: false };
  function monthOf(day) { return day.slice(0, 7); }
  function loadMonth(m) {
    if (S.months[m] || S.loading[m]) return S.loading[m] || Promise.resolve(S.months[m]);
    S.loading[m] = E().priv.read("journal/" + m + ".json").then(function (r) {
      S.months[m] = (r && r.data && r.data.days) ? r.data : { days: {} };
      S.sha[m] = r && r.sha;
      return S.months[m];
    }).catch(function (e) { S.failed = true; S.months[m] = { days: {} }; return S.months[m]; });
    return S.loading[m];
  }
  function loadSettings() {
    if (S.settings) return Promise.resolve(S.settings);
    return E().priv.read("journal/settings.json").then(function (r) {
      S.settings = Object.assign({}, DEFAULTS, (r && r.data) || {});
      S.settings.targets = Object.assign({}, DEFAULTS.targets, ((r && r.data) || {}).targets || {});
      S.settingsSha = r && r.sha;
      return S.settings;
    }).catch(function () { S.settings = JSON.parse(JSON.stringify(DEFAULTS)); return S.settings; });
  }
  function loadActivity(day) {
    if (day in S.activity) return Promise.resolve(S.activity[day]);
    S.activity[day] = null;
    return E().priv.read("journal/activity/" + day + ".json").then(function (r) { S.activity[day] = r ? r.data : null; return S.activity[day]; }).catch(function () { return null; });
  }
  function day(d) { var m = S.months[monthOf(d)]; if (!m) return null; return m.days[d] || null; }
  function dayW(d) { var m = S.months[monthOf(d)]; m.days[d] = m.days[d] || {}; return m.days[d]; }
  function saveMonth(m) {
    clearTimeout(S.timers[m]);
    setStatus("Saving…");
    S.timers[m] = setTimeout(function () {
      // tidy: drop empty days
      var data = S.months[m];
      Object.keys(data.days).forEach(function (k) { if (empty(data.days[k])) delete data.days[k]; });
      E().priv.write("journal/" + m + ".json", data, S.sha[m]).then(function (sha) { S.sha[m] = sha; setStatus("✓ Saved privately"); })
        .catch(function (e) { console.error(e); setStatus("Not saved — check your sign-in"); });
    }, 1200);
  }
  function saveSettings() {
    E().priv.write("journal/settings.json", S.settings, S.settingsSha).then(function (sha) { S.settingsSha = sha; setStatus("✓ Settings saved"); }).catch(function () { setStatus("Settings not saved"); });
  }
  function empty(x) {
    if (!x) return true;
    return !(x.food && x.food.length) && !(x.drinks && x.drinks.length) && !x.water && !x.bathroom && !x.bowel && !x.period && !x.mood && !(x.spend && x.spend.length) && !(x.notes && x.notes.trim());
  }
  function setStatus(t) { S.status = t; var el = document.querySelector(".j-status"); if (el) el.textContent = t; }

  /* ---------- sums ---------- */
  function totals(x) {
    var t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, veg: 0 };
    (x && x.food || []).forEach(function (f) { var q = +f.qty || 1; ["kcal", "protein", "carbs", "fat", "fiber", "veg"].forEach(function (k) { t[k] += (+f[k] || 0) * q; }); });
    (x && x.drinks || []).forEach(function (f) { var q = +f.qty || 1; ["kcal", "protein", "carbs", "fat"].forEach(function (k) { t[k] += (+f[k] || 0) * q; }); });
    t.water = (x && x.water) || 0;
    return t;
  }
  function spent(x) { return (x && x.spend || []).reduce(function (a, s) { return a + (+s.amount || 0); }, 0); }
  function money(n) { var c = (S.settings || DEFAULTS).currency || "$"; return c + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

  /* period: starts, average cycle, next expected */
  function periodInfo(onDay) {
    var all = [];
    Object.keys(S.months).forEach(function (m) { Object.keys(S.months[m].days).forEach(function (d) { if (S.months[m].days[d].period) all.push(d); }); });
    all.sort();
    var starts = all.filter(function (d) { return all.indexOf(addDays(d, -1)) < 0 && all.indexOf(addDays(d, -2)) < 0; });
    var cycles = [];
    for (var i = 1; i < starts.length; i++) { var c = diffDays(starts[i - 1], starts[i]); if (c >= 18 && c <= 50) cycles.push(c); }
    var avg = cycles.length ? Math.round(cycles.reduce(function (a, b) { return a + b; }, 0) / cycles.length) : 28;
    var last = starts.filter(function (d) { return d <= onDay; }).pop();
    if (!last) return { avg: avg, cycles: cycles.length };
    var dayN = diffDays(last, onDay) + 1, next = addDays(last, avg);
    return { avg: avg, cycles: cycles.length, last: last, dayN: dayN, next: next, late: diffDays(next, onDay), inPeriod: all.indexOf(onDay) > -1 };
  }

  /* ---------- calendar marks (the site asks for these) ---------- */
  function marks(d) {
    var x = day(d); if (!x || empty(x)) return "";
    var out = "";
    if (x.mood) out += '<span class="j-m">' + x.mood + "</span>";
    if (x.period) out += '<span class="j-m" title="Period">🩸</span>';
    if (x.food && x.food.length) out += '<span class="j-m" title="Food">🍽</span>';
    if (x.spend && x.spend.length) out += '<span class="j-m" title="Spent">💰</span>';
    if (x.notes && x.notes.trim()) out += '<span class="j-m" title="Note">✎</span>';
    return '<span class="j-marks">' + out + "</span>";
  }

  /* ---------- the day panel ---------- */
  function bar(label, val, target, unit, kind) {
    var pct = target ? Math.min(100, Math.round(val / target * 100)) : 0, word;
    if (kind === "range") word = val < target * 0.85 ? "under" : val > target * 1.15 ? "over" : "about right";
    else word = val >= target * 0.9 ? "enough" : "not yet";
    return '<div class="j-bar"><span class="j-bar-l">' + esc(label) + '</span><span class="j-bar-t"><span style="width:' + pct + '%"></span></span>' +
      '<span class="j-bar-v">' + esc(r0(val) + (unit || "") + " / " + target + (unit || "")) + ' <em class="' + (word === "enough" || word === "about right" ? "ok" : "") + '">' + word + "</em></span></div>";
  }
  function counter(key, label, val) {
    return '<span class="j-counter"><span class="j-c-l">' + label + '</span><button type="button" data-j="dec" data-k="' + key + '" aria-label="Less">−</button><b>' + (val || 0) + '</b><button type="button" data-j="inc" data-k="' + key + '" aria-label="More">+</button></span>';
  }
  function activityHTML(a) {
    if (!a) return '<p class="j-hint">Computer time shows here once the small Mac helper is installed (see the guide in the README).</p>';
    var tl = String(a.timeline || ""), segs = "";
    for (var i = 0; i < 96; i++) {
      var chunk = tl.slice(i * 15, i * 15 + 15), w = (chunk.match(/w/g) || []).length, r = (chunk.match(/r/g) || []).length, o = (chunk.match(/o/g) || []).length;
      var k = w + r + o < 3 ? "" : w >= r && w >= o ? "w" : r >= o ? "r" : "o";
      segs += '<span class="j-tl ' + k + '"></span>';
    }
    var hrs = function (m) { m = +m || 0; return Math.floor(m / 60) + "h " + pad(m % 60) + "m"; };
    var k = a.kinds || {};
    return '<div class="j-timeline">' + segs + '</div><div class="j-tl-axis"><span>0</span><span>6</span><span>12</span><span>18</span><span>24</span></div>' +
      '<p class="j-line"><b>Working</b> ' + hrs(k.work) + " · <b>Other</b> " + hrs(k.other) + " · <b>Breaks & fun</b> " + hrs(k.rest) +
      (a.sessions && a.sessions.length ? '<br><span class="j-hint">' + a.sessions.map(function (s) { return s.from + "–" + s.to; }).join(", ") + "</span>" : "") + "</p>" +
      (a.apps && a.apps.length ? '<p class="j-hint">' + a.apps.slice(0, 6).map(function (x) { return esc(x.name) + " " + hrs(x.minutes); }).join(" · ") + "</p>" : "");
  }
  function foodOptions() {
    var mine = (S.settings && S.settings.my_foods) || [];
    return mine.map(function (f) { return '<option value="' + esc(f.name) + '">'; }).join("") +
      FOODS.map(function (f) { return '<option value="' + esc(f[0] + " " + f[1]) + '">' + esc(f[2]) + "</option>"; }).join("");
  }
  function findFood(name) {
    name = String(name || "").trim(); if (!name) return null;
    var mine = ((S.settings && S.settings.my_foods) || []).filter(function (f) { return f.name === name; })[0];
    if (mine) return Object.assign({}, mine);
    var f = FOODS.filter(function (x) { return x[0] + " " + x[1] === name || x[0] === name || x[1].toLowerCase() === name.toLowerCase(); })[0];
    if (!f) return null;
    return { name: f[0] + " " + f[1], portion: f[2], kcal: f[3], protein: f[4], carbs: f[5], fat: f[6], fiber: f[7], veg: f[8] };
  }
  function panelHTML(d) {
    var x = day(d) || {}, set = S.settings || DEFAULTS, tg = set.targets, t = totals(x), p = periodInfo(d), a = S.activity[d];
    var food = (x.food || []).map(function (f, i) {
      return '<li><span class="j-time">' + esc(f.t || "") + "</span><span>" + esc(f.name) + (f.qty && f.qty != 1 ? " ×" + f.qty : "") + "</span>" +
        '<span class="j-num">' + r0((+f.kcal || 0) * (+f.qty || 1)) + ' kcal</span><button type="button" class="j-x" data-j="del" data-list="food" data-i="' + i + '" aria-label="Remove">×</button></li>';
    }).join("");
    var drinks = (x.drinks || []).map(function (f, i) {
      return '<li><span class="j-time">' + esc(f.t || "") + "</span><span>" + esc(f.name) + (f.ml ? " · " + f.ml + " ml" : "") + '</span><span class="j-num">' + r0((+f.kcal || 0) * (+f.qty || 1)) +
        ' kcal</span><button type="button" class="j-x" data-j="del" data-list="drinks" data-i="' + i + '" aria-label="Remove">×</button></li>';
    }).join("");
    var spend = (x.spend || []).map(function (s, i) {
      return '<li><span class="j-time">' + esc(s.cat || "") + "</span><span>" + esc(s.note || "") + '</span><span class="j-num">' + money(+s.amount || 0) +
        '</span><button type="button" class="j-x" data-j="del" data-list="spend" data-i="' + i + '" aria-label="Remove">×</button></li>';
    }).join("");
    var periodLine = p.inPeriod ? "Day " + p.dayN + " of your period" :
      p.next ? (p.late > 0 ? p.late + (p.late === 1 ? " day" : " days") + " later than expected (" + nice(p.next) + ")" : "Next period expected around " + nice(p.next) + " (in " + (-p.late) + " days)") : "Mark the first day of your period to see the next one";
    return '<section class="j-day"><div class="j-head"><h3>My day · only you</h3><span class="j-status">' + esc(S.status) + "</span></div>" +
      '<div class="j-row">' + counter("water", "💧 Water (cups)", x.water) + counter("bathroom", "🚽 Bathroom", x.bathroom) + counter("bowel", "💩", x.bowel) + "</div>" +
      '<div class="j-row j-moods"><span class="j-c-l">Mood</span>' + MOODS.map(function (m) { return '<button type="button" class="j-mood' + (x.mood === m ? " on" : "") + '" data-j="mood" data-v="' + m + '">' + m + "</button>"; }).join("") + "</div>" +
      '<div class="j-row"><span class="j-c-l">🩸 Period</span>' + FLOW.map(function (f) { return '<button type="button" class="chip' + ((x.period || "") === f[0] ? " on" : "") + '" data-j="period" data-v="' + f[0] + '">' + f[1] + "</button>"; }).join("") +
        '<span class="j-hint j-period">' + esc(periodLine) + (p.cycles ? " · cycle about " + p.avg + " days" : "") + "</span></div>" +

      '<h4>Food</h4><ul class="j-list">' + food + "</ul>" +
      '<div class="j-add"><input class="ed-input" list="j-foods" data-f="fname" placeholder="What did you eat? 吃了什么"><datalist id="j-foods">' + foodOptions() + "</datalist>" +
        '<select class="ed-input j-qty" data-f="fqty"><option value="0.5">½</option><option value="1" selected>×1</option><option value="1.5">×1½</option><option value="2">×2</option><option value="3">×3</option></select>' +
        '<button type="button" class="pill solid" data-j="addfood">Add</button></div>' +
      '<details class="j-more"><summary>Not in the list? Enter the numbers' + (set.gemini_key ? " or ask AI" : "") + '</summary><div class="j-grid">' +
        ["kcal", "protein", "carbs", "fat", "fiber", "veg"].map(function (k) { return '<label><span>' + { kcal: "kcal", protein: "Protein g", carbs: "Carbs g", fat: "Fat g", fiber: "Fibre g", veg: "Veg servings" }[k] + '</span><input class="ed-input" type="number" step="any" data-f="c_' + k + '"></label>'; }).join("") +
        '</div><p class="j-row"><label class="ed-check"><input type="checkbox" data-f="remember" checked> Remember this food</label>' +
        (set.gemini_key ? '<button type="button" class="pill" data-j="ai">Estimate with AI</button>' : "") + "</p></details>" +
      '<div class="j-bars">' + bar("Energy", t.kcal, tg.kcal, " kcal", "range") + bar("Protein", t.protein, tg.protein, " g") + bar("Carbs", t.carbs, tg.carbs, " g", "range") +
        bar("Fibre", t.fiber, tg.fiber, " g") + bar("Vegetables", t.veg, tg.veg, "") + bar("Water", t.water, tg.water, " cups") + "</div>" +

      '<h4>Drinks</h4><ul class="j-list">' + drinks + '</ul><div class="j-chips">' + DRINKS.map(function (dk, i) { return '<button type="button" class="chip" data-j="drink" data-i="' + i + '">' + esc(dk[0] + " " + dk[1]) + "</button>"; }).join("") + "</div>" +

      '<h4>Money</h4><ul class="j-list">' + spend + "</ul>" +
      '<div class="j-add"><input class="ed-input j-amt" type="number" step="any" inputmode="decimal" data-f="amount" placeholder="' + esc(set.currency) + '">' +
        '<select class="ed-input" data-f="cat">' + set.spend_cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + "</select>" +
        '<input class="ed-input" data-f="snote" placeholder="What for (optional)"><button type="button" class="pill solid" data-j="addspend">Add</button></div>' +
      (spent(x) ? '<p class="j-line">Today: <b>' + money(spent(x)) + "</b></p>" : "") +

      '<h4>Notes</h4><textarea class="ed-input j-notes" data-f="notes" rows="4" placeholder="今天… anything you want to remember">' + esc(x.notes || "") + "</textarea>" +

      '<h4>Computer</h4>' + activityHTML(a) +
      '<p class="j-foot"><button type="button" class="linkish" data-j="settings">Targets, currency, AI key…</button></p></section>';
  }
  function monthHTML(m) {
    var data = S.months[m]; if (!data) return "";
    var days = Object.keys(data.days).filter(function (d) { return d.slice(0, 7) === m; });
    if (!days.length) return "";
    var total = 0, byCat = {}, kcal = [], pd = 0;
    days.forEach(function (d) {
      var x = data.days[d];
      (x.spend || []).forEach(function (s) { total += +s.amount || 0; byCat[s.cat || "Other"] = (byCat[s.cat || "Other"] || 0) + (+s.amount || 0); });
      var t = totals(x); if (t.kcal) kcal.push(t.kcal);
      if (x.period) pd++;
    });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; }).map(function (c) { return esc(c) + " " + money(byCat[c]); }).join(" · ");
    var avg = kcal.length ? r0(kcal.reduce(function (a, b) { return a + b; }, 0) / kcal.length) : 0;
    return '<div class="j-month"><span><b>' + money(total) + "</b> spent this month" + (cats ? ' <span class="j-hint">(' + cats + ")</span>" : "") + "</span>" +
      (avg ? "<span>Average <b>" + avg + " kcal</b> on " + kcal.length + " logged days</span>" : "") +
      (pd ? "<span>🩸 " + pd + " period days</span>" : "") + "</div>";
  }

  /* ---------- mounting into the Feed page ---------- */
  function mount(ctx) {
    S.ctx = ctx;
    var m = ctx.month, prev = [], need = !S.months[m] || !S.settings;
    for (var i = 1; i <= 6; i++) { var dd = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 - i, 1); prev.push(dd.getFullYear() + "-" + pad(dd.getMonth() + 1)); }
    var box = ctx.app.querySelector("#journal-day"), sum = ctx.app.querySelector("#journal-month");
    if (need) {
      if (box) box.innerHTML = '<p class="j-hint">Opening your private journal…</p>';
      Promise.all([loadSettings(), loadMonth(m), loadMonth(monthOf(ctx.day)), loadActivity(ctx.day)]).then(function () {
        Promise.all(prev.map(loadMonth)).then(function () { ctx.redraw(); });
        ctx.redraw();
      });
      return;
    }
    if (!(ctx.day in S.activity)) loadActivity(ctx.day).then(function () { ctx.redraw(); });
    if (sum) sum.innerHTML = monthHTML(m);
    if (!box) return;
    box.innerHTML = S.failed ? '<p class="j-hint">The private journal couldn\'t open. Check that you are signed in (open /admin once in this browser).</p>' : panelHTML(ctx.day);
    wire(box, ctx.day);
  }
  function refresh(d) { var box = S.ctx && S.ctx.app.querySelector("#journal-day"); if (box) { var y = window.scrollY; box.innerHTML = panelHTML(d); wire(box, d); window.scrollTo(0, y); } var sum = S.ctx && S.ctx.app.querySelector("#journal-month"); if (sum) sum.innerHTML = monthHTML(monthOf(d)); }
  function changed(d, redrawCalendar) { saveMonth(monthOf(d)); if (redrawCalendar && S.ctx) S.ctx.redraw(); else refresh(d); }
  function wire(box, d) {
    var f = function (name) { return box.querySelector('[data-f="' + name + '"]'); };
    box.onclick = function (e) {
      var b = e.target.closest("[data-j]"); if (!b) return;
      var k = b.getAttribute("data-j"), x = dayW(d);
      if (k === "inc" || k === "dec") { var key = b.getAttribute("data-k"); x[key] = Math.max(0, (x[key] || 0) + (k === "inc" ? 1 : -1)); changed(d); }
      if (k === "mood") { var v = b.getAttribute("data-v"); x.mood = x.mood === v ? "" : v; changed(d, true); }
      if (k === "period") { x.period = b.getAttribute("data-v"); changed(d, true); }
      if (k === "del") { var l = b.getAttribute("data-list"); (x[l] || []).splice(+b.getAttribute("data-i"), 1); changed(d, true); }
      if (k === "drink") { var dk = DRINKS[+b.getAttribute("data-i")]; (x.drinks = x.drinks || []).push({ t: nowTime(), name: dk[0] + " " + dk[1], ml: dk[2], kcal: dk[3], protein: dk[4], carbs: dk[5], fat: dk[6], qty: 1 }); changed(d); }
      if (k === "addfood") addFood(d, x, f);
      if (k === "ai") askAI(d, f);
      if (k === "addspend") {
        var amt = parseFloat(f("amount").value);
        if (!amt) { f("amount").focus(); return; }
        (x.spend = x.spend || []).push({ amount: amt, cat: f("cat").value, note: f("snote").value.trim() });
        changed(d, true);
      }
      if (k === "settings") settingsSheet();
    };
    var notes = f("notes"), nt;
    if (notes) notes.oninput = function () { clearTimeout(nt); nt = setTimeout(function () { var x = dayW(d); x.notes = notes.value; saveMonth(monthOf(d)); }, 800); };
    var fname = f("fname");
    if (fname) fname.onkeydown = function (e) { if (e.key === "Enter") { e.preventDefault(); addFood(d, dayW(d), f); } };
  }
  function addFood(d, x, f) {
    var name = f("fname").value.trim(); if (!name) { f("fname").focus(); return; }
    var qty = parseFloat(f("fqty").value) || 1, known = findFood(name);
    var custom = {}; ["kcal", "protein", "carbs", "fat", "fiber", "veg"].forEach(function (k) { var v = f("c_" + k).value; if (v !== "") custom[k] = +v; });
    var item = known || { name: name };
    Object.keys(custom).forEach(function (k) { item[k] = custom[k]; });
    if (!known && custom.kcal == null) {
      var det = f("c_kcal").closest("details"); if (det) det.open = true;
      setStatus("New food: enter its numbers once (they're remembered)" + ((S.settings || {}).gemini_key ? ", or ask AI" : ""));
      f("c_kcal").focus(); return;
    }
    item.t = nowTime(); item.qty = qty;
    (x.food = x.food || []).push(item);
    if (!known && f("remember") && f("remember").checked) {
      var keep = { name: name }; ["kcal", "protein", "carbs", "fat", "fiber", "veg"].forEach(function (k) { keep[k] = +item[k] || 0; });
      S.settings.my_foods = (S.settings.my_foods || []).filter(function (m) { return m.name !== name; }).concat([keep]);
      saveSettings();
    }
    changed(d, true);
  }
  function askAI(d, f) {
    var name = f("fname").value.trim(), key = (S.settings || {}).gemini_key;
    if (!name || !key) return;
    setStatus("Asking…");
    fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent", {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Estimate nutrition for one usual portion of: " + name + ". Answer JSON only: {\"kcal\":number,\"protein\":grams,\"carbs\":grams,\"fat\":grams,\"fiber\":grams,\"veg\":vegetable servings (half-cup each)}" }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" } })
    }).then(function (r) { return r.json(); }).then(function (j) {
      var t = j.candidates[0].content.parts.map(function (p) { return p.text || ""; }).join(""), v = JSON.parse(t.match(/\{[\s\S]*\}/)[0]);
      ["kcal", "protein", "carbs", "fat", "fiber", "veg"].forEach(function (k) { if (v[k] != null) f("c_" + k).value = r1(v[k]); });
      setStatus("Estimated — check the numbers, then Add");
    }).catch(function () { setStatus("AI didn't answer; enter the numbers yourself"); });
  }
  function settingsSheet() {
    var s = S.settings, t = s.targets;
    var wrap = document.createElement("div");
    wrap.className = "ed-sheet"; wrap.setAttribute("role", "dialog");
    var num = function (k, label) { return '<label class="ed-field"><span class="ed-label">' + label + '</span><input class="ed-input" type="number" step="any" name="' + k + '" value="' + esc(t[k]) + '"></label>'; };
    wrap.innerHTML = '<form class="ed-panel"><header class="ed-head"><h2>Journal settings</h2><button type="button" class="ed-x" data-close aria-label="Close">×</button></header><div class="ed-body">' +
      '<p class="ed-text">Daily amounts to compare with. Change them to whatever suits you.</p>' +
      '<div class="ed-row2">' + num("kcal", "Energy (kcal)") + num("protein", "Protein (g)") + "</div>" + '<div class="ed-row2">' + num("carbs", "Carbs (g)") + num("fat", "Fat (g)") + "</div>" +
      '<div class="ed-row2">' + num("fiber", "Fibre (g)") + num("veg", "Vegetable servings") + "</div>" + num("water", "Water (cups)") +
      '<label class="ed-field"><span class="ed-label">Currency sign</span><input class="ed-input" name="currency" value="' + esc(s.currency) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Spending categories (comma separated)</span><input class="ed-input" name="cats" value="' + esc(s.spend_cats.join(", ")) + '"></label>' +
      '<label class="ed-field"><span class="ed-label">Gemini key for "Estimate with AI" (optional, free at aistudio.google.com)</span><input class="ed-input" name="gemini" type="password" value="' + esc(s.gemini_key || "") + '"></label>' +
      '<p class="ed-hint">Everything here is kept in your private repository, not on the website.</p></div>' +
      '<footer class="ed-foot"><span class="ed-status"></span><span class="ed-actions"><button type="submit" class="pill solid">Save</button></span></footer></form>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add("lb-open");
    var shut = function () { wrap.remove(); document.documentElement.classList.remove("lb-open"); };
    wrap.addEventListener("click", function (e) { if (e.target === wrap || e.target.hasAttribute("data-close")) shut(); });
    wrap.querySelector("form").addEventListener("submit", function (e) {
      e.preventDefault();
      var fm = e.target;
      ["kcal", "protein", "carbs", "fat", "fiber", "veg", "water"].forEach(function (k) { t[k] = +fm[k].value || t[k]; });
      s.currency = fm.currency.value.trim() || "$";
      s.spend_cats = fm.cats.value.split(/[,，]/).map(function (c) { return c.trim(); }).filter(Boolean);
      s.gemini_key = fm.gemini.value.trim();
      saveSettings(); shut(); if (S.ctx) S.ctx.redraw();
    });
  }

  window.AlyxJournal = { mount: mount, marks: marks, _test: { totals: totals, periodInfo: periodInfo, S: S, FOODS: FOODS } };
})();
