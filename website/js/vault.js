(function () {
  "use strict";

  var API_URL = "https://stonecentury-backend.netlify.app/api/ask";

  var STARTERS = [
    "What's the difference between offense and defense with money?",
    "What's the difference between tax planning and tax preparation?",
    "Is it better to have a 401k or whole life insurance?",
    "Why do most people inherit their financial strategy instead of choosing it?"
  ];

  var threadEl = document.querySelector("[data-thread]");
  var emptyEl = document.querySelector("[data-empty]");
  var scrollEl = document.querySelector("[data-scroll]");
  var startersEl = document.querySelector("[data-starters]");
  var draftEl = document.querySelector("[data-draft]");
  var sendBtn = document.querySelector("[data-send]");
  var depthLabelEl = document.querySelector("[data-depth-label]");
  var resetBtn = document.querySelector("[data-reset]");
  var depthBtns = document.querySelectorAll("[data-depth]");

  var depth = "direct";
  var busy = false;
  var timers = [];

  function scrollDown() {
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  function setDepth(next) {
    depth = next;
    depthBtns.forEach(function (b) {
      b.classList.toggle("is-active", b.getAttribute("data-depth") === next);
    });
    depthLabelEl.textContent = next === "structured" ? "Structured answer · Enter to ask" : "Straight answer · Enter to ask";
  }

  function setBusy(next) {
    busy = next;
    sendBtn.classList.toggle("is-busy", next);
  }

  function addUserTurn(text) {
    var row = document.createElement("div");
    row.className = "vault-turn--user";
    var bubble = document.createElement("div");
    bubble.className = "vault-turn--user__bubble";
    bubble.textContent = text;
    row.appendChild(bubble);
    threadEl.appendChild(row);
  }

  function addSourcesBlock(content, sources) {
    var wrap = document.createElement("div");
    wrap.className = "vault-sources";
    var label = document.createElement("div");
    label.className = "vault-sidebar__label";
    label.textContent = "Drawn from";
    var pills = document.createElement("div");
    pills.className = "vault-sources__pills";
    sources.forEach(function (src) {
      var pill = document.createElement("a");
      pill.className = "vault-source-pill";
      pill.textContent = src.title || src;
      if (src.url) {
        pill.href = src.url;
        pill.target = "_blank";
        pill.rel = "noopener";
      }
      pills.appendChild(pill);
    });
    wrap.appendChild(label);
    wrap.appendChild(pills);
    content.appendChild(wrap);
  }

  function addFollowupsBlock(content, followups) {
    var wrap = document.createElement("div");
    wrap.className = "vault-followups";
    followups.forEach(function (label) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "vault-followup-chip";
      chip.textContent = label;
      chip.addEventListener("click", function () { ask(label); });
      wrap.appendChild(chip);
    });
    content.appendChild(wrap);
  }

  function addBookingBlock(content) {
    var box = document.createElement("div");
    box.className = "vault-booking";

    var text = document.createElement("div");
    text.className = "vault-booking__text";
    var title = document.createElement("div");
    title.className = "vault-booking__title";
    title.textContent = "This one needs your numbers";
    var desc = document.createElement("p");
    desc.className = "vault-booking__desc";
    desc.textContent = "Thirty minutes, no pitch. We'll map what you already own.";
    text.appendChild(title);
    text.appendChild(desc);

    var cta = document.createElement("a");
    cta.href = "schedule-a-call.html";
    cta.className = "btn btn--primary btn--sm";
    cta.innerHTML = "Schedule a Call " + '<span class="btn__arrow">→</span>';

    box.appendChild(text);
    box.appendChild(cta);
    content.appendChild(box);
  }

  function addErrorBlock(content, message) {
    var block = document.createElement("div");
    block.className = "vault-block vault-block--lead";
    block.textContent = message;
    content.appendChild(block);
  }

  async function fetchAnswer(question, atDepth) {
    var response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question, depth: atDepth })
    });
    if (!response.ok) {
      throw new Error("Vault backend returned " + response.status);
    }
    return response.json();
  }

  function addBotTurn(question, atDepth) {
    var row = document.createElement("div");
    row.className = "vault-turn--bot";

    var avatar = document.createElement("div");
    avatar.className = "vault-avatar";
    var avatarLabel = document.createElement("span");
    avatarLabel.textContent = "SC";
    avatar.appendChild(avatarLabel);

    var content = document.createElement("div");
    content.className = "vault-turn--bot__content";

    var thinking = document.createElement("div");
    thinking.className = "vault-thinking";
    for (var i = 0; i < 3; i++) {
      var dot = document.createElement("span");
      dot.className = "vault-thinking__dot";
      thinking.appendChild(dot);
    }
    var thinkingLabel = document.createElement("span");
    thinkingLabel.className = "vault-thinking__label";
    thinkingLabel.textContent = "Reading the vault";
    thinking.appendChild(thinkingLabel);
    content.appendChild(thinking);

    row.appendChild(avatar);
    row.appendChild(content);
    threadEl.appendChild(row);
    scrollDown();
    setBusy(true);

    function revealBody(body) {
      var shown = 0;
      function revealNext() {
        if (shown >= body.length) return;
        var b = body[shown];
        if (Array.isArray(b)) {
          b.forEach(function (line) {
            var block = document.createElement("div");
            block.className = "vault-block vault-block--arrow";
            block.textContent = "→   " + line;
            content.appendChild(block);
          });
        } else {
          var block = document.createElement("div");
          block.className = "vault-block" + (shown === 0 ? " vault-block--lead" : "");
          block.textContent = b;
          content.appendChild(block);
        }
        shown += 1;
        scrollDown();
        if (shown < body.length) {
          timers.push(setTimeout(revealNext, 420));
        }
      }
      revealNext();
    }

    fetchAnswer(question, atDepth)
      .then(function (answer) {
        if (thinking.parentNode) thinking.remove();
        var body = Array.isArray(answer.body) ? answer.body : [];
        revealBody(body);
        var afterBody = Math.max(0, (body.length - 1)) * 420 + 40;
        timers.push(setTimeout(function () {
          if (answer.sources && answer.sources.length) addSourcesBlock(content, answer.sources);
          if (answer.followups && answer.followups.length) addFollowupsBlock(content, answer.followups);
          if (answer.needs_booking) addBookingBlock(content);
          scrollDown();
          setBusy(false);
        }, afterBody));
      })
      .catch(function (err) {
        console.error("Vault ask() failed:", err);
        if (thinking.parentNode) thinking.remove();
        addErrorBlock(content, "Something went wrong reaching the Vault just now — try again in a moment, or schedule a call if it keeps happening.");
        scrollDown();
        setBusy(false);
      });
  }

  function ask(text) {
    var q = (text || "").trim();
    if (!q || busy) return;
    if (!emptyEl.hidden) emptyEl.hidden = true;
    threadEl.hidden = false;
    addUserTurn(q);
    draftEl.value = "";
    addBotTurn(q, depth);
  }

  function reset() {
    timers.forEach(clearTimeout);
    timers = [];
    threadEl.innerHTML = "";
    threadEl.hidden = true;
    emptyEl.hidden = false;
    draftEl.value = "";
    setBusy(false);
    draftEl.focus();
  }

  function renderStarters() {
    STARTERS.forEach(function (label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vault-starter-chip";
      btn.textContent = label;
      btn.addEventListener("click", function () { ask(label); });
      startersEl.appendChild(btn);
    });
  }

  depthBtns.forEach(function (b) {
    b.addEventListener("click", function () { setDepth(b.getAttribute("data-depth")); });
  });
  sendBtn.addEventListener("click", function () { ask(draftEl.value); });
  draftEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      ask(draftEl.value);
    }
  });
  resetBtn.addEventListener("click", reset);

  renderStarters();
})();
