"use client";

export function printCalendar(selector: string, title: string, timeline = false) {
  const calendar = document.querySelector<HTMLElement>(selector);
  if (!calendar) return;

  // Isolate the calendar from the app shell, which otherwise adds blank pages.
  const frame = document.createElement("iframe");
  frame.setAttribute("title", `${title} print view`);
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:1100px;height:800px;border:0";
  document.body.appendChild(frame);
  const printDocument = frame.contentDocument;
  if (!printDocument) { frame.remove(); return; }

  // FullCalendar injects CSSOM rules, so copying <style> elements is not enough.
  const styles = Array.from(document.styleSheets).map(sheet => {
    try {
      return `<style>${Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n")}</style>`;
    } catch {
      return sheet.ownerNode instanceof HTMLElement ? sheet.ownerNode.outerHTML : "";
    }
  }).join("\n");
  const markup = calendar.outerHTML;
  const cleanup = () => window.setTimeout(() => frame.remove(), 100);
  frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
  frame.onload = () => {
    if (!printDocument.querySelector(selector)) return;
    void printDocument.fonts.ready.then(() => {
      window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      }, 100);
    });
  };
  printDocument.open();
  printDocument.write(`<!doctype html><html><head><title>${title}</title><base href="${document.baseURI}">${styles}<style>
    @page { size: landscape; margin: 0.35in; }
    html, body { margin: 0 !important; padding: 0 !important; width: 100%; background: white !important; }
    ${selector} { width: 100% !important; zoom: ${timeline ? ".5" : ".8"}; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .calendar-print-heading, .master-calendar-print-heading { display: block !important; margin: 0 0 .25rem !important; color: #101a2b !important; font-size: 1.25rem; font-weight: 700; }
    .dialoggg-calendar { padding: .75rem !important; overflow: visible !important; }
    .fc-header-toolbar { display: flex !important; justify-content: center !important; margin-bottom: .5rem !important; }
    .fc-header-toolbar .fc-toolbar-chunk:not(:has(.fc-toolbar-title)) { display: none !important; }
    .fc-view-harness, .fc-scroller { height: auto !important; min-height: 0 !important; overflow: visible !important; }
    .fc-view-harness-active > .fc-view { position: static !important; }
    .fc-scroller-harness { overflow: visible !important; }
    .fc .fc-scrollgrid, .fc .fc-daygrid-body, .fc .fc-daygrid-body table { width: 100% !important; }
    .fc .fc-daygrid-event-harness, .fc .fc-daygrid-event { max-width: 100%; }
  </style></head><body class="tenant-theme">${markup}</body></html>`);
  printDocument.close();
}
