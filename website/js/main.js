(function () {
  "use strict";

  /* Mobile nav toggle */
  var hamburger = document.querySelector("[data-hamburger]");
  var nav = document.querySelector("[data-nav]");

  if (hamburger && nav) {
    hamburger.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("is-open");
      hamburger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      document.body.style.overflow = isOpen ? "hidden" : "";
    });
  }

  /* Resources dropdown — click-to-toggle on touch/mobile, hover handled in CSS on desktop */
  var dropdownItems = document.querySelectorAll("[data-dropdown]");
  dropdownItems.forEach(function (item) {
    var trigger = item.querySelector("[data-dropdown-trigger]");
    if (!trigger) return;
    trigger.addEventListener("click", function (e) {
      if (window.matchMedia("(max-width: 900px)").matches) {
        e.preventDefault();
        var isOpen = item.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      }
    });
  });

  /* Close mobile nav when a link is clicked */
  if (nav) {
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        if (window.matchMedia("(max-width: 900px)").matches && !link.closest("[data-dropdown]")) {
          nav.classList.remove("is-open");
          if (hamburger) hamburger.setAttribute("aria-expanded", "false");
          document.body.style.overflow = "";
        }
      });
    });
  }

  /* Scroll reveal — each [data-reveal] element animates in independently
     the moment it enters the viewport. Siblings sharing a parent (cards in
     a grid, steps in a timeline) get a staggered delay based on their
     order, so a group cascades in rather than popping in as one block. */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  if (revealEls.length) {
    var STEP_MS = 70;
    var MAX_DELAY_MS = 350;
    var groups = new Map();
    revealEls.forEach(function (el) {
      var parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });
    groups.forEach(function (siblings) {
      siblings.forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i * STEP_MS, MAX_DELAY_MS) + "ms";
      });
    });

    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
      );
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add("is-visible"); });
    }
  }
})();
