(function () {
  'use strict';
  const core = window.NusaRiksaPadkReview;
  const $ = function (id) { return document.getElementById(id); };
  const ui = {
    batchFile: $('batch-file'), pdfFile: $('pdf-file'),
    indicator: $('indicator'), form: $('form-area'),
    progress: $('progress'), category: $('category'),
    frame: $('pdf-frame'), placeholder: $('pdf-placeholder'),
    physicalPage: $('physical-page'), goPage: $('go-page'),
    openPdf: $('open-pdf'), exportTop: $('export'),
    exportBottom: $('export-bottom'), save: $('save-progress'),
    status: $('status'),
  };
  const labels = ['Sangat memadai', 'Memadai', 'Cukup memadai',
    'Kurang memadai', 'Tidak memadai'];
  let batch = null;
  let pdfUrl = null;
  let selected = 0;

  function notify(message, error) {
    ui.status.textContent = message;
    ui.status.className = 'status ' + (error ? 'error' : 'ok');
  }
  function numbered() {
    return batch
      ? [...new Set(batch.entries.map(function (item) { return item.number; }))].sort(function (a,b) { return a-b; })
      : [];
  }
  function buttonState() {
    const p = batch ? core.progress(batch) : { complete:0,total:0 };
    ui.progress.textContent = p.complete + ' / ' + p.total;
    ui.exportTop.disabled = ui.exportBottom.disabled =
      !batch || !pdfUrl || p.complete !== p.total;
    ui.save.disabled = !batch;
  }
  function renderOptions() {
    ui.indicator.replaceChildren();
    for (const num of numbered()) {
      const option = document.createElement('option');
      option.value = String(num);
      option.textContent = 'Indikator ' + num;
      ui.indicator.append(option);
    }
    ui.indicator.disabled = !batch;
    if (batch) ui.indicator.value = String(selected);
  }
  function renderForm() {
    ui.form.replaceChildren();
    if (!batch) {
      const prompt = document.createElement('p');
      prompt.className = 'muted';
      prompt.textContent = 'Muat template JSON untuk mulai mengisi kriteria.';
      ui.form.append(prompt);
      return;
    }
    const rows = batch.entries.filter(function (item) { return item.number === selected; })
      .sort(function (a,b) { return a.rank-b.rank; });
    for (const item of rows) {
      const section = document.createElement('section');
      section.className = 'rank';
      const heading = document.createElement('h3');
      const title = document.createElement('span');
      title.textContent = 'Peringkat ' + item.rank + ' — ' + labels[item.rank-1];
      heading.append(title);
      section.append(heading);

      const summaryLabel = document.createElement('label');
      summaryLabel.className = 'field';
      summaryLabel.textContent = 'Ringkasan kriteria berdasarkan sel PDF sumber';
      const textArea = document.createElement('textarea');
      textArea.maxLength = 3000;
      textArea.value = item.workingSummary;
      textArea.placeholder = 'Isi setelah memeriksa kolom peringkat dan parameter pada PDF.';
      textArea.setAttribute('aria-label','Indikator ' + item.number + ', peringkat '+ item.rank + ', kriteria');
      textArea.addEventListener('input',function () {
        item.workingSummary = textArea.value;
        buttonState();
      });
      summaryLabel.append(textArea);
      section.append(summaryLabel);

      const pageLabel = document.createElement('label');
      pageLabel.className = 'field';
      pageLabel.textContent = 'Nomor halaman tercetak Lampiran IV (38–80)';
      const pageInput = document.createElement('input');
      pageInput.type = 'number';
      pageInput.min = '38';
      pageInput.max = '80';
      pageInput.step = '1';
      pageInput.value = item.criteriaPage === null ? '' : String(item.criteriaPage);
      pageInput.setAttribute('aria-label','Indikator '+item.number+', peringkat '+item.rank+', halaman tercetak');
      pageInput.addEventListener('input',function () {
        item.criteriaPage = pageInput.value === '' ? null : Number(pageInput.value);
        buttonState();
      });
      pageLabel.append(pageInput);
      section.append(pageLabel);
      ui.form.append(section);
    }
    notify('Kategori ' + batch.category + ' · Indikator ' + selected +
      ' · Periksa peringkat pada PDF sebelum ekspor.',false);
  }
  function downloadJson(fileName, value) {
    const blob = new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); },2000);
  }
  function fileName(suffix) {
    const digits = numbered();
    return 'padk-k' + batch.category + '-' + digits[0] +
      '-' + digits[digits.length-1] + '-' + suffix + '.json';
  }
  function saveProgress() {
    if (!batch) return;
    try {
      // An unfinished template can be reopened, but is not eligible for CLI import.
      downloadJson(fileName('progres'),core.checkTemplate(batch));
      notify('Progres tersimpan sebagai JSON lokal. Muat kembali file ini untuk melanjutkan.',false);
    } catch (err) {
      notify(err.message,true);
    }
  }
  function exportReviewedBatch() {
    if (!batch || !pdfUrl) {
      notify('Muat template dan PDF sumber sebelum mengekspor batch.',true);
      return;
    }
    try {
      downloadJson(fileName('siap-validasi'),core.exportBatch(batch));
      notify('Batch diekspor. Jalankan CLI --input untuk validasi, lalu --apply setelah review substansi. Status tetap DRAFT_UNVERIFIED.',false);
    } catch(err) {
      notify(err.message,true);
    }
  }
  ui.batchFile.addEventListener('change',async function () {
    const file = ui.batchFile.files && ui.batchFile.files[0];
    if (!file) return;
    try {
      if (file.size > 2500000) throw new TypeError('File template terlalu besar.');
      const parsed = JSON.parse(await file.text());
      const candidate = core.checkTemplate(parsed);
      batch = candidate;
      selected = numbered()[0];
      ui.category.textContent = 'Kategori ' + batch.category;
      renderOptions();
      renderForm();
      buttonState();
    } catch(err) {
      batch = null;
      selected = 0;
      ui.category.textContent = 'Belum dimuat';
      renderOptions();
      renderForm();
      buttonState();
      notify('Gagal memuat template: ' + err.message,true);
    }
  });
  function displayPage() {
    if (!pdfUrl) return;
    const physical = Number(ui.physicalPage.value);
    if (!Number.isSafeInteger(physical) || physical < 1) {
      notify('Nomor halaman fisik PDF harus bilangan bulat positif.',true);
      return;
    }
    // PDF browser navigation may vary. The printed page must be checked manually.
    ui.frame.src = pdfUrl + '#page=' + physical;
  }
  ui.pdfFile.addEventListener('change',async function () {
    const file = ui.pdfFile.files && ui.pdfFile.files[0];
    if (!file) return;
    try {
      const magic = await file.slice(0,5).text();
      if (magic !== '%PDF-') throw new TypeError('File harus PDF yang valid.');
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      pdfUrl = URL.createObjectURL(file);
      ui.frame.hidden = false;
      ui.placeholder.hidden = true;
      ui.openPdf.hidden = false;
      ui.openPdf.href = pdfUrl;
      ui.goPage.disabled = false;
      displayPage();
      buttonState();
      notify('PDF dimuat hanya di browser lokal. Cocokkan nomor halaman fisik dan tercetak.',false);
    } catch(err) {
      notify('Gagal membaca PDF: ' + err.message,true);
    }
  });
  ui.indicator.addEventListener('change',function () {
    selected = Number(ui.indicator.value);
    renderForm();
  });
  ui.goPage.addEventListener('click',displayPage);
  ui.exportTop.addEventListener('click',exportReviewedBatch);
  ui.exportBottom.addEventListener('click',exportReviewedBatch);
  ui.save.addEventListener('click',saveProgress);
  window.addEventListener('beforeunload',function () {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  });
  buttonState();
})();
