(() => {
  "use strict";

  const STORAGE_KEY = "panelpro-garage-jobs";
  const LEGACY_STORAGE_KEY = "panelpro.jobs.v1";
  const DEMO_JOBS = [
    { id: "JOB-1042", customer: "Lerato Nkosi", vehicle: "Volkswagen Polo" },
    { id: "JOB-1041", customer: "Sipho Dlamini", vehicle: "Toyota Hilux" },
    { id: "JOB-1040", customer: "Amelia Jacobs", vehicle: "Ford Fiesta" }
  ];
  const STATUSES = [
    "Vehicle checked in",
    "Estimate in progress",
    "Awaiting approval",
    "Awaiting parts",
    "In repair",
    "Ready for collection",
    "Collected"
  ];
  const jobsList = document.querySelector("#jobs-list");
  const searchInput = document.querySelector("#search");
  const jobDialog = document.querySelector("#job-dialog");
  const jobForm = document.querySelector("#job-form");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogDescription = document.querySelector("#dialog-description");
  const saveJobButton = document.querySelector("#save-job-button");
  const emptyMessage = document.querySelector("#empty-message");
  const formError = document.querySelector("#form-error");
  const jobsError = document.querySelector("#jobs-error");
  const jobsNotice = document.querySelector("#jobs-notice");
  const importJobsFile = document.querySelector("#import-jobs-file");
  const installAppButton = document.querySelector("#install-app-button");
  let jobs = loadJobs();
  let editingJobId = null;
  let deferredInstallPrompt = null;

  if ("serviceWorker" in navigator && window.isSecureContext && location.protocol !== "file:") {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Could not register the PanelPro service worker.", error);
      jobsError.textContent = "Offline support could not be enabled. Check that PanelPro is running over HTTPS or localhost.";
      jobsError.hidden = false;
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    installAppButton.hidden = false;
  });

  installAppButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;

    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (error) {
      console.error("Could not start the PanelPro installation prompt.", error);
      jobsError.textContent = "Could not open the install prompt. Use your browser menu to install PanelPro.";
      jobsError.hidden = false;
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    installAppButton.hidden = true;
  });

  function isValidJob(job) {
    const estimate = Number(job && job.estimate);
    const amountPaid = job && job.amountPaid !== undefined ? Number(job.amountPaid) : 0;
    return job &&
      typeof job.id === "string" &&
      typeof job.customer === "string" &&
      typeof job.vehicle === "string" &&
      typeof job.repair === "string" &&
      Number.isFinite(estimate) &&
      estimate >= 0 &&
      Number.isFinite(amountPaid) &&
      amountPaid >= 0 &&
      amountPaid <= estimate &&
      isValidDueDate(job.dueDate) &&
      STATUSES.includes(job.status);
  }

  function isValidDueDate(value) {
    if (value === undefined || value === "") return true;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  function getLocalDateString() {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  function formatDueDate(value) {
    return new Intl.DateTimeFormat("en-ZM", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(new Date(`${value}T00:00:00`));
  }

  function isDemoJob(job) {
    return DEMO_JOBS.some((demo) =>
      demo.id === job.id &&
      demo.customer === job.customer &&
      demo.vehicle === job.vehicle
    );
  }

  function loadJobs() {
    try {
      const currentSaved = localStorage.getItem(STORAGE_KEY);
      const legacySaved = localStorage.getItem(LEGACY_STORAGE_KEY);
      const saved = currentSaved ?? legacySaved;
      if (saved === null) return [];

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) throw new Error("Saved job data is not a list.");
      const validJobs = parsed.filter(isValidJob).map((job) => ({
        ...job,
        estimate: Number(job.estimate),
        amountPaid: job.amountPaid === undefined ? 0 : Number(job.amountPaid),
        dueDate: job.dueDate ?? ""
      }));
      const loadedJobs = validJobs.filter((job) => !isDemoJob(job));

      if (loadedJobs.length !== validJobs.length) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(loadedJobs));
          if (currentSaved === null) localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch (error) {
          console.error("Could not remove saved demo jobs.", error);
        }
      }

      return loadedJobs;
    } catch (error) {
      console.error("Could not load saved jobs.", error);
      return [];
    }
  }

  function persistJobs(errorTarget = formError) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
      errorTarget.hidden = true;
      return true;
    } catch (error) {
      console.error("Could not save jobs to browser storage.", error);
      errorTarget.textContent = "Changes could not be saved in this browser. Check available storage and try again.";
      errorTarget.hidden = false;
      return false;
    }
  }

  function exportJobs() {
    let downloadUrl;
    jobsError.hidden = true;
    jobsNotice.hidden = true;
    try {
      const now = new Date();
      const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
      ].join("-");
      const backup = {
        format: "panelpro-jobs-backup",
        version: 1,
        exportedAt: now.toISOString(),
        jobs
      };
      const file = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json"
      });
      downloadUrl = URL.createObjectURL(file);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `panelpro-jobs-${date}.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      jobsNotice.textContent = "Job backup download started.";
      jobsNotice.hidden = false;
    } catch (error) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      console.error("Could not export the job backup.", error);
      jobsError.textContent = "Could not export the job backup. Try again or check your browser's download settings.";
      jobsError.hidden = false;
    }
  }

  function parseBackupJobs(backup) {
    if (!backup || backup.format !== "panelpro-jobs-backup" || backup.version !== 1 || !Array.isArray(backup.jobs)) {
      throw new Error("This file is not a supported PanelPro jobs backup.");
    }

    const seenIds = new Set();
    const validatedJobs = backup.jobs.map((job, index) => {
      const validStrings =
        job &&
        typeof job.id === "string" &&
        typeof job.customer === "string" &&
        typeof job.vehicle === "string" &&
        typeof job.repair === "string" &&
        (job.phone === undefined || typeof job.phone === "string") &&
        (job.registration === undefined || typeof job.registration === "string") &&
        (job.dueDate === undefined || typeof job.dueDate === "string");
      const estimate = Number(job && job.estimate);
      const amountPaid = job && job.amountPaid !== undefined ? Number(job.amountPaid) : 0;
      const dueDate = job && job.dueDate !== undefined ? job.dueDate : "";
      if (
        !validStrings ||
        !Number.isFinite(estimate) ||
        estimate < 0 ||
        !Number.isFinite(amountPaid) ||
        amountPaid < 0 ||
        amountPaid > estimate ||
        !isValidDueDate(dueDate) ||
        !STATUSES.includes(job.status)
      ) {
        throw new Error(`Job ${index + 1} has invalid or incomplete data.`);
      }

      const normalizedJob = {
        id: job.id.trim(),
        customer: job.customer.trim(),
        phone: (job.phone || "").trim(),
        vehicle: job.vehicle.trim(),
        registration: (job.registration || "").trim(),
        repair: job.repair.trim(),
        estimate,
        amountPaid,
        dueDate,
        status: job.status
      };
      if (
        !normalizedJob.id ||
        normalizedJob.id.length > 40 ||
        !normalizedJob.customer ||
        normalizedJob.customer.length > 100 ||
        normalizedJob.phone.length > 30 ||
        !normalizedJob.vehicle ||
        normalizedJob.vehicle.length > 100 ||
        normalizedJob.registration.length > 20 ||
        !normalizedJob.repair ||
        normalizedJob.repair.length > 500
      ) {
        throw new Error(`Job ${index + 1} has invalid or incomplete data.`);
      }
      if (seenIds.has(normalizedJob.id)) {
        throw new Error(`The backup contains duplicate job ID ${normalizedJob.id}.`);
      }
      seenIds.add(normalizedJob.id);
      return normalizedJob;
    });

    const jobsToImport = validatedJobs.filter((job) => !isDemoJob(job));
    return {
      jobs: jobsToImport,
      ignoredDemoCount: validatedJobs.length - jobsToImport.length
    };
  }

  async function importJobs(file) {
    jobsError.hidden = true;
    jobsNotice.hidden = true;
    try {
      const backup = JSON.parse(await file.text());
      const { jobs: importedJobs, ignoredDemoCount } = parseBackupJobs(backup);
      if (jobs.length > 0 && !window.confirm(
        `Replace the ${jobs.length} current job(s) with ${importedJobs.length} job(s) from this backup? Current jobs will be overwritten.`
      )) {
        return;
      }

      const previousJobs = jobs;
      jobs = importedJobs;
      if (!persistJobs(jobsError)) {
        jobs = previousJobs;
        return;
      }

      renderJobs();
      jobsNotice.textContent = `Imported ${jobs.length} job${jobs.length === 1 ? "" : "s"} from backup${ignoredDemoCount ? `; ignored ${ignoredDemoCount} demo job${ignoredDemoCount === 1 ? "" : "s"}` : ""}.`;
      jobsNotice.hidden = false;
    } catch (error) {
      console.error("Could not import the job backup.", error);
      jobsError.textContent = error instanceof SyntaxError
        ? "The selected file is not valid JSON."
        : error.message;
      jobsError.hidden = false;
    } finally {
      importJobsFile.value = "";
    }
  }

  function escapeText(value) {
    const element = document.createElement("span");
    element.textContent = String(value ?? "");
    return element.innerHTML;
  }

  function formatCurrency(amount) {
    return new Intl.NumberFormat("en-ZM", {
      style: "currency",
      currency: "ZMW",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  }

  function formatQuotationCurrency(amount) {
    return new Intl.NumberFormat("en-ZM", {
      style: "currency",
      currency: "ZMW",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  }

  function openQuotation(job) {
    openJobDocument(job, false);
  }

  function openInvoice(job) {
    openJobDocument(job, true);
  }

  function openJobDocument(job, isInvoice) {
    jobsError.hidden = true;
    const documentWindow = window.open("", "_blank");
    const documentType = isInvoice ? "invoice" : "quotation";
    const documentTitle = isInvoice ? "INVOICE" : "QUOTATION";
    if (!documentWindow) {
      jobsError.textContent = `The ${documentType} preview was blocked. Allow pop-ups, then use ${isInvoice ? "Invoice" : "Quote"} in the job row.`;
      jobsError.hidden = false;
      return;
    }

    documentWindow.opener = null;
    const quoteDate = new Intl.DateTimeFormat("en-ZA", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date());
    const amount = formatQuotationCurrency(job.estimate);
    const amountPaid = formatQuotationCurrency(job.amountPaid ?? 0);
    const balance = formatQuotationCurrency(job.estimate - (job.amountPaid ?? 0));
    const summary = isInvoice
      ? `<div class="invoice-summary">
          <div class="summary-row"><span>Estimate total</span><strong>${escapeText(amount)}</strong></div>
          <div class="summary-row"><span>Amount paid to date</span><strong>${escapeText(amountPaid)}</strong></div>
          <div class="summary-row summary-balance"><span>Balance due</span><strong>${escapeText(balance)}</strong></div>
        </div>`
      : `<div class="total">Total: ${escapeText(amount)}</div>`;
    const html = `<!doctype html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${escapeText(documentTitle)} ${escapeText(job.id)} — Raymond's Garage</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 32px; color: #1d2926; background: #f2f5f3; font: 14px Arial, Helvetica, sans-serif; }
          .toolbar { width: min(800px, 100%); margin: 0 auto 16px; text-align: right; }
          button { padding: 10px 15px; border: 0; border-radius: 7px; color: #163d35; background: #d9ee72; font: inherit; font-weight: 700; cursor: pointer; }
          .quotation { width: min(800px, 100%); min-height: 700px; margin: auto; padding: 48px; background: white; box-shadow: 0 3px 16px #163d3515; }
          .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 20px; border-bottom: 3px solid #163d35; }
          h1 { margin: 0; color: #163d35; font-size: 26px; }
          .subtitle, .quote-meta, .muted { color: #68756f; }
          .subtitle { margin: 6px 0 0; font-size: 12px; }
          .quote-title { color: #163d35; font-size: 22px; font-weight: 800; text-align: right; }
          .quote-meta { margin-top: 8px; font-size: 12px; text-align: right; }
          .details { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 28px 0 20px; }
          .label { margin-bottom: 7px; color: #74817b; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
          .value { font-size: 13px; line-height: 1.7; white-space: pre-line; overflow-wrap: anywhere; }
          .repair { margin: 20px 0; padding: 14px; border-radius: 7px; background: #f3f7f5; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
          table { width: 100%; border-collapse: collapse; }
          th { padding: 10px 8px; color: #64716b; background: #f5f7f6; font-size: 10px; text-align: left; text-transform: uppercase; }
          td { padding: 12px 8px; border-bottom: 1px solid #e8edea; font-size: 13px; }
          th:last-child, td:last-child { text-align: right; }
          .total { width: min(280px, 100%); margin: 20px 0 0 auto; padding-top: 12px; border-top: 2px solid #163d35; color: #163d35; font-size: 17px; font-weight: 800; text-align: right; }
          .invoice-summary { width: min(320px, 100%); margin: 20px 0 0 auto; }
          .summary-row { display: flex; justify-content: space-between; gap: 16px; padding: 8px 0; color: #52605a; }
          .summary-row strong { color: #1d2926; white-space: nowrap; }
          .summary-balance { margin-top: 4px; padding-top: 12px; border-top: 2px solid #163d35; color: #163d35; font-size: 17px; font-weight: 800; }
          .summary-balance strong { color: #163d35; }
          .footer { margin-top: 42px; padding-top: 14px; border-top: 1px solid #e5ebe7; color: #68756f; font-size: 11px; }
          @media (max-width: 560px) { body { padding: 12px; } .quotation { min-height: 0; padding: 22px; } .header { flex-direction: column; } .quote-title, .quote-meta { text-align: left; } }
          @media print { @page { size: A4; margin: 14mm; } body { padding: 0; background: white; } .toolbar { display: none; } .quotation { width: 100%; min-height: 0; padding: 0; box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="toolbar"><button id="print-document" type="button">Print / Save PDF</button></div>
        <main class="quotation">
          <div class="header">
            <div>
              <h1>Raymond's Garage</h1>
              <p class="subtitle">Panel Beating &amp; Vehicle Repairs<br>Phone: 0977335916<br>Address: Plot 609/16A Chamba Valley Lusaka</p>
            </div>
            <div>
              <div class="quote-title">${escapeText(documentTitle)}</div>
              <div class="quote-meta">Job ${escapeText(job.id)}<br>Date: ${escapeText(quoteDate)}</div>
            </div>
          </div>
          <div class="details">
            <div>
              <div class="label">Prepared for</div>
              <div class="value">${escapeText(job.customer)}${job.phone ? `\n${escapeText(job.phone)}` : ""}</div>
            </div>
            <div>
              <div class="label">Vehicle</div>
              <div class="value">${escapeText(job.vehicle)}${job.registration ? `\nRegistration: ${escapeText(job.registration)}` : ""}</div>
            </div>
          </div>
          <div class="label">Repair description</div>
          <div class="repair">${escapeText(job.repair)}</div>
          <table>
            <thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
            <tbody><tr><td>Repair work</td><td>1</td><td>${escapeText(amount)}</td><td>${escapeText(amount)}</td></tr></tbody>
          </table>
          ${summary}
          <div class="footer">${escapeText(documentTitle)} for job ${escapeText(job.id)} from Raymond's Garage.</div>
        </main>
      </body>
      </html>`;

    documentWindow.document.open();
    documentWindow.document.write(html);
    documentWindow.document.close();
    documentWindow.document.querySelector("#print-document").addEventListener("click", () => {
      documentWindow.addEventListener("afterprint", () => {
        documentWindow.close();
        window.focus();
      }, { once: true });
      documentWindow.print();
    });
  }

  function updateSummary() {
    document.querySelector("#active-count").textContent =
      jobs.filter((job) => job.status !== "Collected").length;
    document.querySelector("#parts-count").textContent =
      jobs.filter((job) => job.status === "Awaiting parts").length;
    document.querySelector("#ready-count").textContent =
      jobs.filter((job) => job.status === "Ready for collection").length;
    document.querySelector("#balance-count").textContent =
      formatCurrency(jobs.reduce((total, job) => total + job.estimate - (job.amountPaid ?? 0), 0));
  }

  function renderJobs() {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const today = getLocalDateString();
    const visibleJobs = jobs.filter((job) =>
      [job.id, job.customer, job.phone, job.vehicle, job.registration, job.repair, job.dueDate, job.status, job.amountPaid]
        .some((value) => String(value || "").toLocaleLowerCase().includes(query))
    );

    jobsList.innerHTML = visibleJobs.map((job) => {
      const overdue = Boolean(job.dueDate && job.dueDate < today && job.status !== "Collected");
      const dueDateText = job.dueDate
        ? `${overdue ? "Overdue: " : ""}${formatDueDate(job.dueDate)}`
        : "Not set";
      return `
      <tr>
        <td><span class="job-number">${escapeText(job.id)}</span></td>
        <td>
          <span class="cell-primary">${escapeText(job.customer)}</span>
          <span class="cell-secondary">${escapeText(job.phone || "No phone added")}</span>
        </td>
        <td>
          <span class="cell-primary">${escapeText(job.vehicle)}</span>
          <span class="cell-secondary">${escapeText(job.registration || "No registration")}</span>
        </td>
        <td><span class="repair-cell" title="${escapeText(job.repair)}">${escapeText(job.repair)}</span></td>
        <td><span class="due-date ${overdue ? "due-date-overdue" : ""}">${escapeText(dueDateText)}</span></td>
        <td><span class="estimate">${formatCurrency(job.estimate)}</span></td>
        <td>${formatCurrency(job.amountPaid ?? 0)}</td>
        <td><span class="balance ${job.amountPaid >= job.estimate ? "balance-settled" : "balance-due"}">${formatCurrency(job.estimate - (job.amountPaid ?? 0))}</span></td>
        <td>
          <select class="status-select" data-job-id="${escapeText(job.id)}" aria-label="Update job status">
            ${STATUSES.map((status) => `
              <option value="${escapeText(status)}" ${job.status === status ? "selected" : ""}>${escapeText(status)}</option>
            `).join("")}
          </select>
        </td>
        <td class="document-actions">
          <button class="quote-button" type="button" data-quote-job-id="${escapeText(job.id)}">Quote</button>
          <button class="invoice-button" type="button" data-invoice-job-id="${escapeText(job.id)}">Invoice</button>
        </td>
        <td class="job-actions">
          <button class="row-action-button edit-button" type="button" data-edit-job-id="${escapeText(job.id)}">Edit</button>
          <button class="row-action-button delete-button" type="button" data-delete-job-id="${escapeText(job.id)}">Delete</button>
        </td>
      </tr>
    `;
    }).join("");

    emptyMessage.hidden = visibleJobs.length > 0;
    updateSummary();
  }

  function openDialog(job = null) {
    jobForm.reset();
    formError.hidden = true;
    editingJobId = job ? job.id : null;
    dialogTitle.textContent = job ? "Edit repair job" : "New repair job";
    dialogDescription.textContent = job
      ? "Update the customer and vehicle details."
      : "Enter the customer and vehicle details.";
    saveJobButton.textContent = job ? "Save changes" : "Save job";
    if (job) {
      ["customer", "phone", "vehicle", "registration", "repair", "estimate", "amountPaid", "status", "dueDate"]
        .forEach((name) => {
          jobForm.elements[name].value = job[name] ?? "";
        });
    }

    if (typeof jobDialog.showModal === "function") {
      jobDialog.showModal();
      jobForm.elements.customer.focus();
    } else {
      formError.textContent = "This browser does not support the job form. Please use a modern browser.";
      formError.hidden = false;
    }
  }

  function closeDialog() {
    jobDialog.close();
    jobForm.reset();
    formError.hidden = true;
    editingJobId = null;
    dialogTitle.textContent = "New repair job";
    dialogDescription.textContent = "Enter the customer and vehicle details.";
    saveJobButton.textContent = "Save job";
  }

  function deleteJob(job) {
    const confirmed = window.confirm(
      `Delete job ${job.id} for ${job.customer}? This cannot be undone. Export a backup first if you may need this record.`
    );
    if (!confirmed) return;

    jobsError.hidden = true;
    jobsNotice.hidden = true;
    const index = jobs.findIndex((item) => item.id === job.id);
    if (index < 0) return;
    const [deletedJob] = jobs.splice(index, 1);
    if (!persistJobs(jobsError)) {
      jobs.splice(index, 0, deletedJob);
      return;
    }

    renderJobs();
    jobsNotice.textContent = `Deleted job ${job.id}.`;
    jobsNotice.hidden = false;
  }

  document.querySelector("#new-job-button").addEventListener("click", openDialog);
  document.querySelector("#export-jobs-button").addEventListener("click", exportJobs);
  document.querySelector("#import-jobs-button").addEventListener("click", () => {
    importJobsFile.click();
  });
  importJobsFile.addEventListener("change", () => {
    const file = importJobsFile.files && importJobsFile.files[0];
    if (file) importJobs(file);
  });
  document.querySelector("#empty-new-job").addEventListener("click", openDialog);
  document.querySelector("#close-dialog").addEventListener("click", closeDialog);
  document.querySelector("#cancel-dialog").addEventListener("click", closeDialog);
  searchInput.addEventListener("input", renderJobs);

  jobDialog.addEventListener("click", (event) => {
    if (event.target === jobDialog) closeDialog();
  });

  jobForm.addEventListener("submit", (event) => {
    event.preventDefault();
    formError.hidden = true;

    const data = new FormData(jobForm);
    const estimate = Number(data.get("estimate"));
    const amountPaid = Number(data.get("amountPaid"));
    if (!Number.isFinite(estimate) || estimate < 0) {
      formError.textContent = "Enter a valid estimate of zero or more.";
      formError.hidden = false;
      return;
    }
    if (!Number.isFinite(amountPaid) || amountPaid < 0) {
      formError.textContent = "Enter a valid amount paid of zero or more.";
      formError.hidden = false;
      return;
    }
    if (amountPaid > estimate) {
      formError.textContent = "Amount paid cannot be greater than the estimate.";
      formError.hidden = false;
      return;
    }

    const details = {
      customer: String(data.get("customer")).trim(),
      phone: String(data.get("phone")).trim(),
      vehicle: String(data.get("vehicle")).trim(),
      registration: String(data.get("registration")).trim(),
      repair: String(data.get("repair")).trim(),
      estimate,
      amountPaid,
      dueDate: String(data.get("dueDate") || ""),
      status: String(data.get("status"))
    };

    if (!details.customer || !details.vehicle || !details.repair || !isValidDueDate(details.dueDate) || !STATUSES.includes(details.status)) {
      formError.textContent = "Check the required customer, vehicle, repair and status fields, and enter a valid due date if provided.";
      formError.hidden = false;
      return;
    }

    let job;
    let editedIndex = -1;
    let previousJob;
    if (editingJobId) {
      editedIndex = jobs.findIndex((item) => item.id === editingJobId);
      if (editedIndex < 0) {
        formError.textContent = "This job could not be found. Close the form and try again.";
        formError.hidden = false;
        return;
      }
      previousJob = jobs[editedIndex];
      job = { ...previousJob, ...details };
      jobs[editedIndex] = job;
    } else {
      const nextNumber = Math.max(
        1042,
        ...jobs.map((item) => Number(item.id.replace(/\D/g, "")) || 0)
      ) + 1;
      job = { id: `JOB-${nextNumber}`, ...details };
      jobs = [job, ...jobs];
    }

    if (!persistJobs()) {
      if (editedIndex >= 0) {
        jobs[editedIndex] = previousJob;
      } else {
        jobs.shift();
      }
      return;
    }

    renderJobs();
    closeDialog();
    openQuotation(job);
  });

  jobsList.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const quoteButton = event.target.closest("[data-quote-job-id]");
    if (quoteButton) {
      const job = jobs.find((item) => item.id === quoteButton.dataset.quoteJobId);
      if (job) openQuotation(job);
      return;
    }

    const invoiceButton = event.target.closest("[data-invoice-job-id]");
    if (invoiceButton) {
      const job = jobs.find((item) => item.id === invoiceButton.dataset.invoiceJobId);
      if (job) openInvoice(job);
      return;
    }

    const editButton = event.target.closest("[data-edit-job-id]");
    if (editButton) {
      const job = jobs.find((item) => item.id === editButton.dataset.editJobId);
      if (job) openDialog(job);
      return;
    }

    const deleteButton = event.target.closest("[data-delete-job-id]");
    if (deleteButton) {
      const job = jobs.find((item) => item.id === deleteButton.dataset.deleteJobId);
      if (job) deleteJob(job);
    }
  });

  jobsList.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLSelectElement) || !event.target.matches(".status-select")) return;
    const job = jobs.find((item) => item.id === event.target.dataset.jobId);
    if (!job || !STATUSES.includes(event.target.value)) return;

    const previousStatus = job.status;
    job.status = event.target.value;
    if (!persistJobs(jobsError)) {
      job.status = previousStatus;
    }
    renderJobs();
  });

  renderJobs();
})();
