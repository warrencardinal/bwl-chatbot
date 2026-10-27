(function () {
  if (window.__bwlChatLoaded) return;
  window.__bwlChatLoaded = true;

  var script = document.currentScript;
  var API = new URL(script.src).origin;
  var COLOR = script.getAttribute("data-color") || "#40085e";
  // Seconds before the greeting bubble appears; data-delay="0" turns it off.
  var DELAY = Number(script.getAttribute("data-delay") || 8);
  var TEASER = "Have a family law question? I can help you reach Brandi Wolfe Law.";
  var TINT = (function (hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) return "rgba(64,8,94,.15)";
    var n = parseInt(m[1], 16);
    return "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + ",.15)";
  })(COLOR);
  var GREETING =
    "Hi, I can help you reach Brandi Wolfe Law or set up a consultation. What can we help you with?";
  var DISCLAIMER =
    "Automated assistant. Not legal advice. Chatting does not create an attorney-client relationship. Please don't share confidential details here.";
  var STORE = "bwlchat_v1";
  var SRC = "bwlchat_src";

  // First page of the visit: where they landed and how they got here.
  var source = null;
  try {
    source = JSON.parse(sessionStorage.getItem(SRC));
  } catch (e) {}
  if (!source) {
    var q = new URLSearchParams(location.search);
    source = { landing: location.href.slice(0, 500), referrer: (document.referrer || "").slice(0, 500) };
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "gbraid", "wbraid", "msclkid", "fbclid"].forEach(function (k) {
      var v = q.get(k);
      if (v) source[k] = v.slice(0, 200);
    });
    try {
      sessionStorage.setItem(SRC, JSON.stringify(source));
    } catch (e) {}
  }

  function start() {

  // ---------- state ----------
  var state = load() || { messages: [], session: null };
  var busy = false;

  function load() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE));
    } catch (e) {
      return null;
    }
  }
  function save() {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(state));
    } catch (e) {}
  }

  // ---------- UI ----------
  var host = document.createElement("div");
  host.id = "bwl-chat";
  document.body.appendChild(host);
  var root = host.attachShadow({ mode: "open" });

  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:" + COLOR + ";color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}" +
    ".btn svg{width:28px;height:28px}" +
    ".panel{position:fixed;right:20px;bottom:92px;z-index:2147483000;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:#fff;color:#1d2433;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}" +
    ".panel.open{display:flex}" +
    ".head{background:" + COLOR + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}" +
    ".head b{font-size:15px}" +
    ".x{background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 4px}" +
    ".disc{font-size:11px;line-height:1.4;color:#5b6375;background:#f4f5f8;padding:8px 14px;border-bottom:1px solid #e4e7ee}" +
    ".log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}" +
    ".m{max-width:85%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".a{background:#f1f3f7;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".u{background:" + COLOR + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".a a{color:inherit;font-weight:600}" +
    ".err{font-size:12px;color:#b42318;align-self:center;text-align:center}" +
    ".typing{color:#6b7385;font-size:13px;align-self:flex-start;padding:4px 2px}" +
    ".composer{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e7ee}" +
    ".composer textarea{flex:1;resize:none;height:42px;max-height:110px;border:1px solid #cfd4de;border-radius:10px;padding:10px 12px;font-size:14px;color:#1d2433;outline:none}" +
    ".composer textarea:focus{border-color:" + COLOR + "}" +
    ".card{align-self:stretch;border:1px solid #dde1e8;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:9px;background:#fff}" +
    ".card label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#3b4456}" +
    ".card input{font-size:16px;padding:9px 10px;border:1px solid #cfd4de;border-radius:8px;color:#1d2433;outline:none;width:100%}" +
    ".card input:focus{border-color:" + COLOR + ";box-shadow:0 0 0 3px " + TINT + "}" +
    ".card input[aria-invalid=true]{border-color:#b42318}" +
    ".card .fe{font-size:12px;color:#b42318;font-weight:400}" +
    ".card .hint{font-size:12px;color:#6b7385;margin:-2px 0 0}" +
    ".card .primary{margin-top:2px}" +
    ".card.done{opacity:.75}" +
    ".send{border:0;border-radius:10px;padding:0 14px;background:" + COLOR + ";color:#fff;font-size:14px;cursor:pointer}" +
    ".send:disabled{opacity:.5;cursor:default}" +
    ".sched{display:none;flex:1;flex-direction:column;min-height:0}" +
    ".panel.scheduling .log,.panel.scheduling .composer{display:none}" +
    ".panel.scheduling .sched{display:flex}" +
    ".sbar{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid #e4e7ee;font-size:13px}" +
    ".back{background:none;border:0;padding:4px 0;font-size:13px;font-weight:600;color:" + COLOR + ";cursor:pointer}" +
    ".tz{color:#6b7385}" +
    ".slots{flex:1;overflow-y:auto;padding:12px 14px}" +
    ".day{font-size:13px;font-weight:700;margin:12px 0 6px}" +
    ".day:first-child{margin-top:0}" +
    ".times{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}" +
    ".t{border:1px solid #cfd4de;background:#fff;border-radius:8px;padding:8px 0;font-size:13px;color:#1d2433;cursor:pointer}" +
    ".t:hover{border-color:" + COLOR + "}" +
    ".note{font-size:13px;color:#5b6375;padding:6px 0}" +
    ".confirm{padding:16px 14px;display:flex;flex-direction:column;gap:12px}" +
    ".confirm b{font-size:15px}" +
    ".row2{display:flex;gap:8px}" +
    ".primary{flex:1;border:0;border-radius:10px;padding:11px;background:" + COLOR + ";color:#fff;font-size:14px;font-weight:600;cursor:pointer}" +
    ".primary:disabled{opacity:.5;cursor:default}" +
    ".secondary{border:1px solid #cfd4de;border-radius:10px;padding:11px 14px;background:#fff;color:#1d2433;font-size:14px;cursor:pointer}" +
    ".pick{align-self:flex-start;border:0;border-radius:10px;padding:10px 14px;background:" + COLOR + ";color:#fff;font-size:14px;font-weight:600;cursor:pointer}" +
    ".teaser{position:fixed;right:20px;bottom:92px;z-index:2147483000;max-width:260px;background:#fff;color:#1d2433;border-radius:14px 14px 4px 14px;box-shadow:0 8px 28px rgba(0,0,0,.2);padding:12px 34px 12px 14px;font-size:14px;line-height:1.4;cursor:pointer;display:none;border-top:3px solid " + COLOR + "}" +
    ".teaser.show{display:block;animation:pop .25s ease-out}" +
    ".teaser .tx{position:absolute;top:6px;right:6px;background:none;border:0;font-size:18px;line-height:1;color:#6b7385;cursor:pointer;padding:2px 6px}" +
    "@keyframes pop{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
    "@media (prefers-reduced-motion:reduce){.teaser.show{animation:none}}" +
    "@media (max-width:480px){.teaser{right:16px;left:16px;max-width:none}}" +
    "@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.btn.hide{display:none}}" +
    "</style>" +
    '<button class="btn" aria-label="Open chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>' +
    '<div class="teaser" role="status"><span class="tt"></span><button class="tx" type="button" aria-label="Dismiss">&times;</button></div>' +
    '<div class="panel" role="dialog" aria-label="Chat with Brandi Wolfe Law">' +
    '<div class="head"><b>Brandi Wolfe Law</b><button class="x" aria-label="Close chat">&times;</button></div>' +
    '<div class="disc"></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<div class="sched"><div class="sbar"><button class="back" type="button">&larr; Back to chat</button><span class="tz">Central Time</span></div><div class="slots" aria-live="polite"></div></div>' +
    '<form class="composer"><textarea placeholder="Type your message" aria-label="Message" maxlength="2000"></textarea><button class="send" type="submit">Send</button></form>' +
    "</div>";

  var btn = root.querySelector(".btn");
  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var form = root.querySelector(".composer");
  var input = root.querySelector("textarea");
  var sendBtn = root.querySelector(".send");
  var slotsEl = root.querySelector(".slots");
  root.querySelector(".back").addEventListener("click", function () {
    showScheduler(false);
  });

  function msg(text, cls) {
    var d = document.createElement("div");
    d.className = cls || "note";
    d.textContent = text;
    return d;
  }

  function showScheduler(on) {
    if (on && (!state.canSchedule || state.booked)) return;
    panel.classList.toggle("scheduling", on);
    if (on) {
      loadSlots();
    } else {
      render();
      input.focus();
    }
  }

  function loadSlots(notice) {
    slotsEl.textContent = "";
    slotsEl.appendChild(msg("Loading open times..."));
    getSession()
      .then(function (session) {
        return post("/slots", { session: session });
      })
      .then(function (d) {
        slotsEl.textContent = "";
        if (notice) slotsEl.appendChild(msg(notice, "err"));
        if (!d.days) {
          slotsEl.appendChild(msg(d.error || "Couldn't load times. Please call (210) 571-0400.", "err"));
          return;
        }
        if (!d.days.length) {
          slotsEl.appendChild(msg("No open times right now. The firm will contact you to schedule, or call (210) 571-0400."));
          return;
        }
        d.days.forEach(function (day) {
          slotsEl.appendChild(msg(day.label, "day"));
          var grid = document.createElement("div");
          grid.className = "times";
          day.slots.forEach(function (sl) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "t";
            b.textContent = sl.label;
            b.addEventListener("click", function () {
              confirmSlot(day.label, sl);
            });
            grid.appendChild(b);
          });
          slotsEl.appendChild(grid);
        });
      })
      .catch(function () {
        slotsEl.textContent = "";
        slotsEl.appendChild(msg("Couldn't load times. Please call (210) 571-0400.", "err"));
      });
  }

  function confirmSlot(dayText, sl) {
    slotsEl.textContent = "";
    var box = document.createElement("div");
    box.className = "confirm";
    var title = document.createElement("b");
    title.textContent = dayText + " at " + sl.label + " Central";
    var row = document.createElement("div");
    row.className = "row2";
    var other = document.createElement("button");
    other.type = "button";
    other.className = "secondary";
    other.textContent = "Other times";
    var yes = document.createElement("button");
    yes.type = "button";
    yes.className = "primary";
    yes.textContent = "Book this time";
    row.appendChild(other);
    row.appendChild(yes);
    box.appendChild(title);
    box.appendChild(row);
    slotsEl.appendChild(box);

    other.addEventListener("click", function () {
      loadSlots();
    });
    yes.addEventListener("click", function () {
      yes.disabled = true;
      other.disabled = true;
      yes.textContent = "Booking...";
      getSession()
        .then(function (session) {
          return post("/book", { session: session, start: sl.start });
        })
        .then(function (d) {
          if (d.ok) {
            state.booked = true;
            state.messages.push({ role: "assistant", content: d.message });
            save();
            showScheduler(false);
          } else if (d.refresh) {
            loadSlots(d.error);
          } else {
            box.appendChild(msg(d.error || "Couldn't book. Please call (210) 571-0400.", "err"));
            yes.textContent = "Book this time";
            yes.disabled = false;
            other.disabled = false;
          }
        })
        .catch(function () {
          box.appendChild(msg("Couldn't book. Please call (210) 571-0400.", "err"));
          yes.textContent = "Book this time";
          yes.disabled = false;
          other.disabled = false;
        });
    });
  }
  root.querySelector(".disc").textContent = DISCLAIMER;

  // Greeting bubble: once per visit, only if they haven't opened or dismissed the chat.
  var teaser = root.querySelector(".teaser");
  teaser.querySelector(".tt").textContent = TEASER;
  function hideTeaser(remember) {
    teaser.classList.remove("show");
    if (remember) {
      state.teased = true;
      save();
    }
  }
  teaser.addEventListener("click", function (e) {
    if (e.target.closest(".tx")) return hideTeaser(true);
    hideTeaser(true);
    toggle(true);
  });
  if (DELAY > 0 && !state.teased && !state.messages.length) {
    setTimeout(function () {
      if (!panel.classList.contains("open") && !state.teased) teaser.classList.add("show");
    }, DELAY * 1000);
  }

  btn.addEventListener("click", function () {
    hideTeaser(true);
    toggle(!panel.classList.contains("open"));
  });
  root.querySelector(".x").addEventListener("click", function () {
    toggle(false);
  });

  function toggle(open) {
    panel.classList.toggle("open", open);
    btn.classList.toggle("hide", open);
    if (open) {
      render();
      input.focus();
    }
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text || busy) return;
    input.value = "";
    state.messages.push({ role: "user", content: text });
    save();
    render();
    send();
  });

  function linkify(el, text) {
    var parts = text.split(/(https?:\/\/[^\s)]+)/g);
    parts.forEach(function (p, i) {
      if (i % 2 === 1) {
        var a = document.createElement("a");
        a.href = p;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = p;
        el.appendChild(a);
      } else if (p) {
        el.appendChild(document.createTextNode(p));
      }
    });
  }

  function bubble(role, text) {
    var d = document.createElement("div");
    d.className = "m " + (role === "user" ? "u" : "a");
    if (role === "user") d.textContent = text;
    else linkify(d, text);
    log.appendChild(d);
  }

  function render(extra) {
    log.textContent = "";
    bubble("assistant", GREETING);
    state.messages.forEach(function (m, i) {
      bubble(m.role, m.display || m.content);
      if (state.form && !state.form.done && state.form.at === i) log.appendChild(contactCard());
    });
    if (state.canSchedule && !state.booked && !busy) {
      var pick = document.createElement("button");
      pick.className = "pick";
      pick.type = "button";
      pick.textContent = "Pick a consultation time";
      pick.addEventListener("click", function () {
        showScheduler(true);
      });
      log.appendChild(pick);
    }
    if (busy) {
      var t = document.createElement("div");
      t.className = "typing";
      t.textContent = "Typing...";
      log.appendChild(t);
    }
    if (extra) {
      var er = document.createElement("div");
      er.className = "err";
      er.textContent = extra;
      log.appendChild(er);
    }
    sendBtn.disabled = busy;
    log.scrollTop = log.scrollHeight;
  }

  // ---------- network ----------
  function post(path, body) {
    return fetch(API + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) {
      return r.json().then(function (d) {
        d._status = r.status;
        return d;
      });
    });
  }

  function turnstileToken(siteKey) {
    return new Promise(function (resolve, reject) {
      function run() {
        var box = document.createElement("div");
        box.style.cssText = "position:fixed;right:20px;bottom:660px;z-index:2147483001";
        document.body.appendChild(box);
        window.turnstile.render(box, {
          sitekey: siteKey,
          appearance: "interaction-only",
          callback: function (tok) {
            box.remove();
            resolve(tok);
          },
          "error-callback": function () {
            box.remove();
            reject(new Error("turnstile"));
          },
        });
      }
      if (window.turnstile) return run();
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = run;
      s.onerror = function () {
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
  }

  function getSession() {
    if (state.session) return Promise.resolve(state.session);
    return fetch(API + "/config")
      .then(function (r) {
        return r.json();
      })
      .then(function (cfg) {
        return cfg.turnstileSiteKey ? turnstileToken(cfg.turnstileSiteKey) : null;
      })
      .then(function (tok) {
        return post("/session", { turnstileToken: tok });
      })
      .then(function (d) {
        if (!d.session) throw new Error(d.error || "session");
        state.session = d.session;
        save();
        return d.session;
      });
  }

  var T = {
    en: { name: "Name", phone: "Phone", email: "Email", other: "Other party's name (optional)", either: "Phone or email is required.", send: "Send my details", sending: "Sending...", fail: "Couldn't send. Please call (210) 571-0400." },
    es: { name: "Nombre", phone: "Teléfono", email: "Correo electrónico", other: "Nombre de la otra parte (opcional)", either: "Se requiere teléfono o correo electrónico.", send: "Enviar mis datos", sending: "Enviando...", fail: "No se pudo enviar. Llame al (210) 571-0400." },
  };

  function field(name, label, type, auto, value) {
    var l = document.createElement("label");
    l.textContent = label;
    var i = document.createElement("input");
    i.name = name;
    i.type = type;
    i.autocomplete = auto;
    if (type === "tel") i.inputMode = "tel";
    i.maxLength = name === "email" ? 200 : 120;
    i.value = value || "";
    var e = document.createElement("span");
    e.className = "fe";
    e.setAttribute("aria-live", "polite");
    l.appendChild(i);
    l.appendChild(e);
    return l;
  }

  function contactCard() {
    var f = state.form;
    var t = T[f.lang] || T.en;
    var v = f.values || {};
    var card = document.createElement("form");
    card.className = "card";
    card.noValidate = true;
    card.appendChild(field("name", t.name, "text", "name", v.name));
    card.appendChild(field("phone", t.phone, "tel", "tel", v.phone));
    card.appendChild(field("email", t.email, "email", "email", v.email));
    var hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = t.either;
    card.appendChild(hint);
    card.appendChild(field("opposing_party", t.other, "text", "off", v.opposing_party));
    var b = document.createElement("button");
    b.type = "submit";
    b.className = "primary";
    b.textContent = t.send;
    card.appendChild(b);
    var note = msg("", "err");
    card.appendChild(note);

    card.addEventListener("input", function () {
      f.values = {
        name: card.elements.name.value,
        phone: card.elements.phone.value,
        email: card.elements.email.value,
        opposing_party: card.elements.opposing_party.value,
      };
      save();
    });

    card.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;
      var vals = {
        name: card.elements.name.value.trim(),
        phone: card.elements.phone.value.trim(),
        email: card.elements.email.value.trim(),
        opposing_party: card.elements.opposing_party.value.trim(),
      };
      ["name", "phone", "email"].forEach(function (k) {
        card.elements[k].removeAttribute("aria-invalid");
        card.elements[k].parentNode.querySelector(".fe").textContent = "";
      });
      note.textContent = "";
      busy = true;
      b.disabled = true;
      b.textContent = t.sending;
      getSession()
        .then(function (session) {
          return post("/contact", {
            session: session,
            form: f.token,
            lang: f.lang,
            name: vals.name,
            phone: vals.phone,
            email: vals.email,
            opposing_party: vals.opposing_party,
            page: location.href,
            source: source,
          });
        })
        .then(function (d) {
          busy = false;
          if (d.ok) {
            f.done = true;
            f.values = null;
            var shown = [vals.name, vals.phone, vals.email].filter(Boolean).join("\n");
            state.messages.push({ role: "user", content: d.note, display: shown });
            state.messages.push({ role: "assistant", content: d.reply });
            if (d.schedule) state.canSchedule = true;
            save();
            render();
            if (d.schedule) showScheduler(true);
            return;
          }
          b.disabled = false;
          b.textContent = t.send;
          if (d.errors) {
            Object.keys(d.errors).forEach(function (k) {
              var el = card.elements[k];
              if (!el) return;
              el.setAttribute("aria-invalid", "true");
              el.parentNode.querySelector(".fe").textContent = d.errors[k];
            });
            var firstBad = card.querySelector("[aria-invalid=true]");
            if (firstBad) firstBad.focus();
          } else {
            note.textContent = d.error || t.fail;
          }
        })
        .catch(function () {
          busy = false;
          b.disabled = false;
          b.textContent = t.send;
          note.textContent = t.fail;
        });
    });
    return card;
  }

  function restoreLast() {
    var last = state.messages.pop();
    if (last && last.role === "user") input.value = last.content;
    save();
  }

  function send(retried) {
    busy = true;
    render();
    getSession()
      .then(function (session) {
        return post("/chat", { session: session, messages: state.messages, page: location.href, source: source });
      })
      .then(function (d) {
        if (d._status === 401 && !retried) {
          state.session = null;
          save();
          busy = false;
          return send(true);
        }
        busy = false;
        if (d.reply) {
          state.messages.push({ role: "assistant", content: d.reply });
          if (d.form && d.form.token && !(state.form && state.form.done)) {
            state.form = { token: d.form.token, lang: d.form.lang, at: state.messages.length - 1, done: false };
          }
          var opened = d.schedule === true && !state.booked;
          if (opened) state.canSchedule = true;
          save();
          render();
          if (opened) showScheduler(true);
          if (d.form) {
            var nm = log.querySelector(".card input[name=name]");
            if (nm) nm.focus();
          }
        } else {
          restoreLast();
          render(d.error || "Something went wrong. Please call (210) 571-0400.");
        }
      })
      .catch(function () {
        busy = false;
        restoreLast();
        render("Couldn't connect. Please call (210) 571-0400.");
      });
  }
  }

  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
})();
