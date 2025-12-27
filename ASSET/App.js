(() => {
  // =========================
  // CONFIG (AUTO-FIND PATH)
  // =========================
  const DATA_DIR_CANDIDATES = [
    "./DATA_ADMINISTRASI",
    "./DATA ADMINISTRASI",
    "./data_administrasi",
    "./Data_Administrasi",
  ];

  const FILES = {
    batas: [
      "Desa Pasirlangu.geojson",
      "Desa_Pasirlangu.geojson",
      "desa_pasirlangu.geojson",
    ],
    aset: [
      "Sebaran Aset Desa.geojson",
      "Sebaran_Aset_Desa.geojson",
      "sebaran_aset_desa.geojson",
      "aset_desa.geojson",
    ],
    fasilitas: [
      "Sebaran Fasilitas Umum.geojson",
      "Sebaran_Fasilitas_Umum.geojson",
      "sebaran_fasilitas_umum.geojson",
      "fasilitas_umum.geojson",
    ],
    umkm: [
      "Sebaran UMKM.geojson",
      "Sebaran_UMKM.geojson",
      "sebaran_umkm.geojson",
      "umkm.geojson",
    ],
  };

  // =========================
  // DOM
  // =========================
  const el = {
    navPills: document.getElementById("navPills"),
    nav: document.querySelectorAll(".navPill"),

    viewTentang: document.getElementById("viewTentang"),
    viewMap: document.getElementById("viewMap"),
    headerActions: document.getElementById("headerActions"),

    btnZoom: document.getElementById("btnZoom"),
    btnReset: document.getElementById("btnReset"),

    mapTitle: document.getElementById("mapTitle"),
    datasetLabel: document.getElementById("datasetLabel"),

    chkBatas: document.getElementById("chkBatas"),
    chkDataset: document.getElementById("chkDataset"),

    loading: document.getElementById("loading"),
    toast: document.getElementById("toast"),
    info: document.getElementById("infoBox"),
  };

  function setLoading(v) {
    if (!el.loading) return;
    el.loading.style.display = v ? "flex" : "none";
  }

  function toast(msg, ms = 2400) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.toast.style.display = "none"), ms);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function popupProps(props) {
    if (!props) return "<i>Tidak ada atribut</i>";
    const entries = Object.entries(props);
    if (!entries.length) return "<i>Tidak ada atribut</i>";
    return entries
      .slice(0, 60)
      .map(([k, v]) => `<div style="margin:6px 0"><b>${escapeHtml(k)}</b>: ${escapeHtml(v)}</div>`)
      .join("");
  }

  // =========================
  // INFO LOCK (FIX atribut ketimpa)
  // =========================
  let infoLockUntil = 0;
  function isInfoLocked() { return Date.now() < infoLockUntil; }
  function setInfo(html, lockMs = 0) {
    el.info.innerHTML = html;
    if (lockMs > 0) infoLockUntil = Date.now() + lockMs;
  }
  function resetInfoDefault() {
    if (isInfoLocked()) return;
    el.info.textContent = "Arahkan kursor ke batas desa untuk info singkat.";
  }

  // =========================
  // FETCH HELPERS (TRY MANY)
  // =========================
  async function tryFetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function loadFirstAvailable(candidates) {
    let lastErr = null;
    for (const raw of candidates) {
      const url = encodeURI(raw); // penting: spasi aman
      try {
        const data = await tryFetchJson(url);
        return { url, data };
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error("Gagal memuat data");
  }

  function buildCandidates(kind) {
    const names = FILES[kind] || [];
    const out = [];
    for (const dir of DATA_DIR_CANDIDATES) {
      for (const name of names) out.push(`${dir}/${name}`);
    }
    return out;
  }

  // =========================
  // MAP + BASEMAPS
  // =========================
  let map = null;
  let batasLayer = null;
  let datasetLayer = null;

  let basemapOSM = null;
  let basemapEsri = null;
  let layersControl = null;

  const cache = { batas: null, aset: null, fasilitas: null, umkm: null };
  let currentKind = "aset";

  function ensureMap() {
    if (map) return;

    map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([-6.9, 107.6], 11);

    // OSM
    basemapOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 20,
      attribution: "© OpenStreetMap contributors",
    });

    // Satellite (Esri) - aman & stabil
    basemapEsri = L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 20,
        attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      }
    );

    // Default basemap
    basemapOSM.addTo(map);

    // Basemap switcher
    layersControl = L.control.layers(
      { "OpenStreetMap": basemapOSM, "Satelit (Esri)": basemapEsri },
      {},
      { position: "topright", collapsed: true }
    ).addTo(map);
  }

  function invalidateMapSoon() {
    if (!map) return;
    setTimeout(() => map.invalidateSize(true), 120);
  }

  function styleBatas() { return { color: "#000", weight: 3, fillOpacity: 0 }; }
  function styleBatasHover() { return { color: "#000", weight: 5, fillOpacity: 0 }; }

  function pointStyle() {
    return { radius: 7, weight: 2, color: "#ffffff", fillColor: "#f97316", fillOpacity: 0.95 };
  }

  function labelKind(kind) {
    if (kind === "aset") return "Aset Desa";
    if (kind === "fasilitas") return "Fasilitas Umum";
    if (kind === "umkm") return "UMKM";
    return "Sebaran";
  }

  async function loadBatasIfNeeded() {
    if (cache.batas) return cache.batas;

    setLoading(true);
    el.info.textContent = "Memuat batas desa…";

    const candidates = buildCandidates("batas");
    const { data } = await loadFirstAvailable(candidates);
    cache.batas = data;

    setLoading(false);
    resetInfoDefault();
    return data;
  }

  async function loadDatasetIfNeeded(kind) {
    if (cache[kind]) return cache[kind];

    setLoading(true);
    el.info.textContent = "Memuat sebaran…";

    const candidates = buildCandidates(kind);
    const { data } = await loadFirstAvailable(candidates);
    cache[kind] = data;

    setLoading(false);
    return data;
  }

  function renderBatas() {
    if (!map || !cache.batas) return;

    if (batasLayer) {
      map.removeLayer(batasLayer);
      batasLayer = null;
    }

    // batas: hover info saja (tanpa popup klik)
    batasLayer = L.geoJSON(cache.batas, {
      style: styleBatas,
      onEachFeature: (feature, layer) => {
        layer.on("mouseover", () => {
          if (isInfoLocked()) return;
          layer.setStyle(styleBatasHover());
          setInfo(`<b>Info batas</b><div style="margin-top:6px">${popupProps(feature.properties)}</div>`);
        });

        layer.on("mouseout", () => {
          if (isInfoLocked()) return;
          batasLayer.resetStyle(layer);
          resetInfoDefault();
        });
      },
    });

    if (el.chkBatas?.checked) batasLayer.addTo(map);
    try { batasLayer.bringToBack(); } catch {}
  }

  function renderDataset(kind) {
    if (!map || !cache[kind]) return;

    if (datasetLayer) {
      map.removeLayer(datasetLayer);
      datasetLayer = null;
    }

    datasetLayer = L.geoJSON(cache[kind], {
      pointToLayer: (f, latlng) => L.circleMarker(latlng, pointStyle()),
      onEachFeature: (f, layer) => {
        const title = labelKind(kind);
        const html = `<b>${title}</b><div style="margin-top:6px">${popupProps(f.properties)}</div>`;

        layer.bindPopup(html, { maxWidth: 420 });

        layer.on("click", (e) => {
          infoLockUntil = Date.now() + 5000;
          setInfo(html, 5000);
          layer.openPopup();
          L.DomEvent.stopPropagation(e);
        });
      },
    });

    if (el.chkDataset?.checked) datasetLayer.addTo(map);
    try { datasetLayer.bringToFront(); } catch {}
  }

  function fitToBatas() {
    if (!map || !batasLayer) return;
    const b = batasLayer.getBounds();
    if (b.isValid()) map.fitBounds(b, { padding: [22, 22] });
  }

  async function showMap(kind) {
    currentKind = kind;

    el.viewTentang.classList.remove("viewActive");
    el.viewMap.classList.add("viewActive");
    el.headerActions.style.display = "flex";

    ensureMap();
    invalidateMapSoon();

    el.mapTitle.textContent = `Peta ${labelKind(kind)}`;
    el.datasetLabel.textContent = `Tampilkan sebaran ${labelKind(kind)}`;

    try {
      await loadBatasIfNeeded();
      renderBatas();

      await loadDatasetIfNeeded(kind);
      renderDataset(kind);

      fitToBatas();
      toast(`Peta ${labelKind(kind)} siap ✅`);
    } catch (err) {
      console.error(err);
      setLoading(false);
      setInfo(
        `<b style="color:#b91c1c">Error: Gagal memuat data</b><br>
         <span style="color:#64748b">Pastikan nama file di DATA_ADMINISTRASI sama persis (spasi/underscore).</span>`
      );
      toast("Gagal memuat GeoJSON ❌", 3200);
    }
  }

  function showTentang() {
    el.viewMap.classList.remove("viewActive");
    el.viewTentang.classList.add("viewActive");
    el.headerActions.style.display = "none";
  }

  function setActiveTab(view) {
    el.nav.forEach((a) => a.classList.toggle("isActive", a.dataset.view === view));

    // FIX: biar tab aktif tidak “kepotong”
    const active = document.querySelector(".navPill.isActive");
    active?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  async function routeFromHash() {
    const h = (location.hash || "#tentang").replace("#", "").trim();

    if (h === "aset" || h === "fasilitas" || h === "umkm") {
      setActiveTab(h);
      await showMap(h);
      return;
    }

    setActiveTab("tentang");
    showTentang();
  }

  window.addEventListener("hashchange", routeFromHash);

  // Buttons
  el.btnZoom?.addEventListener("click", () => {
    if (!map || !batasLayer) return toast("Batas desa belum siap", 1800);
    fitToBatas();
  });

  el.btnReset?.addEventListener("click", async () => {
    if (!map) return;

    infoLockUntil = 0;

    if (el.chkBatas) el.chkBatas.checked = true;
    if (el.chkDataset) el.chkDataset.checked = true;

    try {
      await loadBatasIfNeeded();
      renderBatas();

      await loadDatasetIfNeeded(currentKind);
      renderDataset(currentKind);

      fitToBatas();
      resetInfoDefault();
      toast("Tampilan direset ✅", 1800);
    } catch (e) {
      console.error(e);
      toast("Reset gagal (cek data) ❌", 2200);
    }
  });

  // Layer toggles
  el.chkBatas?.addEventListener("change", () => {
    if (!map || !batasLayer) return;
    if (el.chkBatas.checked) batasLayer.addTo(map);
    else map.removeLayer(batasLayer);
  });

  el.chkDataset?.addEventListener("change", () => {
    if (!map || !datasetLayer) return;
    if (el.chkDataset.checked) datasetLayer.addTo(map);
    else map.removeLayer(datasetLayer);
  });

  // Hero jump
  document.querySelectorAll("[data-jump]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-jump");
      location.hash = `#${target}`;
    });
  });

  // INIT
  routeFromHash();
})();
