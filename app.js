const APP_VERSION = "1.7.0";
const starterMedicines = [
  { id: 1, name: "Paracetamol 500mg", category: "Uncategorized", gondola: "G-01", shelf: "Shelf A", addedAt: 6 },
  { id: 2, name: "Ibuprofen 200mg", category: "Uncategorized", gondola: "G-01", shelf: "Shelf B", addedAt: 5 },
  { id: 3, name: "Cetirizine 10mg", category: "Uncategorized", gondola: "G-03", shelf: "Shelf A", addedAt: 4 },
  { id: 4, name: "Ascorbic Acid 500mg", category: "Uncategorized", gondola: "G-04", shelf: "Shelf C", addedAt: 3 },
  { id: 5, name: "Omeprazole 20mg", category: "Uncategorized", gondola: "G-02", shelf: "Shelf B", addedAt: 2 },
  { id: 6, name: "Loperamide 2mg", category: "Uncategorized", gondola: "G-02", shelf: "Shelf C", addedAt: 1 }
];
const retiredPresetCategories = ["Pain relief", "Antibiotics", "Allergy", "Cough & cold", "Digestive care", "Vitamins", "Vitamins & supplements", "First aid", "Dermatology", "Diabetes care", "Heart & blood pressure", "Women's health", "Children's medicine"];

let medicines = JSON.parse(localStorage.getItem("medicine-finder-inventory") || "null") || starterMedicines;
let locations = JSON.parse(localStorage.getItem("medimap-locations") || "[]");
const savedCategoryChoices = JSON.parse(localStorage.getItem("medimap-categories") || "null");
const categoryPresetMigrationDone = localStorage.getItem("medimap-category-presets-removed") === "1";
let categoryChoices = savedCategoryChoices ? (categoryPresetMigrationDone ? savedCategoryChoices : savedCategoryChoices.filter((category) => !retiredPresetCategories.includes(category))) : ["Uncategorized"];
if (!categoryChoices.includes("Uncategorized")) categoryChoices.push("Uncategorized");
const starterIdentity = new Map(starterMedicines.map((item) => [item.id, item.name]));
if (!categoryPresetMigrationDone) medicines = medicines.map((item) => starterIdentity.get(item.id) === item.name && retiredPresetCategories.includes(item.category) ? { ...item, category: "Uncategorized" } : item);
consolidateMedicineBatches();
localStorage.setItem("medimap-categories", JSON.stringify(categoryChoices));
localStorage.setItem("medicine-finder-inventory", JSON.stringify(medicines));
localStorage.setItem("medimap-category-presets-removed", "1");
let viewMode = localStorage.getItem("medimap-view") || "grid";
let boxSelectMode = false;
let activeCategory = "All";
let categoriesExpanded = false;
let activeGondola = "";
let activeExpiryFilter = "";
let selectionMode = false;
let undoOperation = null;
let preservedScrollY = 0;
let cardSwipe = null;
let swipeJustHappened = false;
let editingMedicineId = null;
let shelfGuideCollapsed = localStorage.getItem("medimap-shelf-guide-collapsed") === "1";
let customPharmacyName = localStorage.getItem("medimap-custom-name") || "";
let categoryDescriptions = JSON.parse(localStorage.getItem("medimap-category-descriptions") || "{}");
const selectedIds = new Set();
const organizerSelectedIds = new Set();
let activeExpiryLocation = null;
let organizeActiveCell = null;
let organizePlacements = new Map((JSON.parse(localStorage.getItem("medimap-organizer-layout") || "[]") || []).map(([id, placement]) => [Number(id), placement]));
let organizerRowCounts = JSON.parse(localStorage.getItem("medimap-organizer-row-counts") || "{}");
let organizerDrafts = JSON.parse(localStorage.getItem("medimap-organizer-drafts") || "{}");

const $ = (selector) => document.querySelector(selector);
const grid = $("#medicineGrid");
const search = $("#searchInput");
function addLocation(gondola, shelf) { if (!gondola || !shelf) return; let location = locations.find((item) => item.gondola.toLowerCase() === gondola.toLowerCase()); if (!location) { location = { gondola, shelves: [] }; locations.push(location); } if (!location.shelves.some((item) => item.toLowerCase() === shelf.toLowerCase())) location.shelves.push(shelf); }
medicines.forEach((item) => addLocation(item.gondola, item.shelf));

function render() {
  const query = search.value.trim().toLowerCase();
  let visible = medicines.filter((item) => {
    const matchesCategory = activeCategory === "All" || item.category === activeCategory;
    const matchesGondola = !activeGondola || item.gondola === activeGondola;
    const expiries = getExpiries(item); const status = combinedExpiryStatus(item);
    const matchesExpiry = !activeExpiryFilter || (activeExpiryFilter === "undated" ? !expiries.length : activeExpiryFilter === "scheduled" ? expiries.length && !status : status === activeExpiryFilter);
    const haystack = `${item.name} ${item.genericName || ""} ${item.category} ${item.gondola} ${item.shelf} ${getExpiries(item).map(formatExpiry).join(" ")}`.toLowerCase();
    return matchesCategory && matchesGondola && matchesExpiry && haystack.includes(query);
  });
  const sort = $("#sortSelect").value;
  visible.sort((a, b) => sort === "name-desc" ? b.name.localeCompare(a.name) : sort === "location" ? `${a.gondola}${a.shelf}`.localeCompare(`${b.gondola}${b.shelf}`) : sort === "newest" ? b.addedAt - a.addedAt : a.name.localeCompare(b.name));
  grid.classList.toggle("list-view", viewMode === "list");
  grid.innerHTML = visible.map((item) => { const expiries = getExpiries(item); return `<article class="medicine-card ${selectedIds.has(item.id) ? "selected" : ""}" data-card-id="${item.id}"><label class="select-control" aria-label="Select ${escapeHtml(item.name)}"><input type="checkbox" data-select="${item.id}" ${selectedIds.has(item.id) ? "checked" : ""}><span></span></label><div class="med-icon">Rx</div><div class="medicine-card-copy"><h3>${escapeHtml(item.name)}</h3>${item.genericName ? `<small class="generic-name">${escapeHtml(item.genericName)}</small>` : ""}<div class="med-tags"><span class="category-tag">${escapeHtml(item.category || "Uncategorized")}</span>${expiries.length ? `<span class="expiry-tag ${combinedExpiryStatus(item)}">Exp ${escapeHtml(expiries.map(formatExpiry).join(" · "))}</span>` : ""}</div></div><div class="location"><strong>${escapeHtml(item.gondola)}</strong><small>${escapeHtml(item.shelf)}</small></div><button class="card-menu-button" type="button" data-card-menu="${item.id}" aria-label="Actions for ${escapeHtml(item.name)}" aria-expanded="false">•••</button><div class="card-action-menu" data-card-actions="${item.id}" hidden><button type="button" data-details="${item.id}">View details</button><button type="button" data-edit-medicine="${item.id}">Edit medicine</button><button type="button" class="card-action-delete" data-delete="${item.id}">Delete</button></div></article>`; }).join("");
  $("#resultCount").textContent = `${visible.length} medicine${visible.length === 1 ? "" : "s"}`;
  $("#emptyState").hidden = visible.length > 0;
  $("#clearSearch").hidden = !query && activeCategory === "All" && !activeGondola && !activeExpiryFilter;
  updateSelectionBar();
  renderFilters();
  renderQuickFilters();
  renderLocationLists();
  renderShelfGuide();
  updateViewButtons();
}

function renderQuickFilters() {
  const gondolaSelect = $("#mobileGondolaFilter");
  const gondolas = [...new Set([...locations.map((item) => item.gondola), ...medicines.map((item) => item.gondola)])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  gondolaSelect.innerHTML = `<option value="">All gondolas</option>` + gondolas.map((gondola) => `<option value="${escapeHtml(gondola)}">${escapeHtml(gondola)}</option>`).join("");
  gondolaSelect.value = activeGondola;
  $("#mobileExpiryFilter").value = activeExpiryFilter;
  const chips = [];
  if (activeCategory !== "All") chips.push({ type: "category", label: activeCategory });
  if (activeGondola) chips.push({ type: "gondola", label: activeGondola });
  if (activeExpiryFilter) chips.push({ type: "expiry", label: $("#mobileExpiryFilter").selectedOptions[0]?.textContent || activeExpiryFilter });
  if (search.value.trim()) chips.push({ type: "search", label: `“${search.value.trim()}”` });
  const holder = $("#activeFilterChips"); holder.hidden = !chips.length;
  holder.innerHTML = chips.map((chip) => `<button class="active-filter-chip" type="button" data-clear-filter="${chip.type}">${escapeHtml(chip.label)} <b aria-hidden="true">×</b><span class="sr-only">Remove filter</span></button>`).join("");
}

function renderFilters() {
  const categories = ["All", ...new Set(medicines.map((item) => item.category || "Uncategorized"))];
  $("#categoryFilters").innerHTML = categories.map((category) => `<button class="filter-pill ${category === activeCategory ? "active" : ""}" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("");
  $("#categoryFilters").hidden = !categoriesExpanded;
  $("#toggleCategories").setAttribute("aria-expanded", String(categoriesExpanded));
  $("#toggleCategories").classList.toggle("active", categoriesExpanded || activeCategory !== "All");
  $("#toggleCategories").textContent = activeCategory === "All" ? `Categories (${Math.max(0, categories.length - 1)}) ${categoriesExpanded ? "▲" : "▼"}` : `${activeCategory} ${categoriesExpanded ? "▲" : "▼"}`;
  const choices = [...new Set([...categoryChoices, ...categories.slice(1)])];
  const addValue = $("#categoryInput").value || "Uncategorized";
  const bulkValue = $("#bulkCategory").value;
  $("#categoryInput").innerHTML = choices.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("") + `<option value="__new__">＋ Add new category…</option>`;
  $("#bulkCategory").innerHTML = `<option value="">Choose category…</option>` + choices.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join("") + `<option value="__new__">＋ Add new category…</option>`;
  if (choices.includes(addValue)) $("#categoryInput").value = addValue;
  if (choices.includes(bulkValue) || bulkValue === "__new__") $("#bulkCategory").value = bulkValue;
  $("#bulkNewCategory").hidden = $("#bulkCategory").value !== "__new__";
}

function renderShelfGuide() {
  const groups = new Map();
  locations.forEach((location) => location.shelves.forEach((shelf) => groups.set(`${location.gondola} · ${shelf}`, { gondola: location.gondola, shelf, categories: new Set(), count: 0, dated: 0 })));
  medicines.forEach((item) => {
    const location = `${item.gondola} · ${item.shelf}`;
    if (!groups.has(location)) groups.set(location, { gondola: item.gondola, shelf: item.shelf, categories: new Set(), count: 0, dated: 0 });
    const group = groups.get(location); group.categories.add(item.category || "Uncategorized"); group.count++; if (item.expiry) group.dated++;
  });
  $("#shelfGuide").innerHTML = [...groups].sort().slice(0, 12).map(([location, group]) => `<div class="shelf-row shelf-location"><div><strong>${escapeHtml(location)}</strong><span>${group.count ? escapeHtml([...group.categories].join(", ")) : "Empty shelf"}</span></div><button class="expiry-button" data-expiry-gondola="${escapeHtml(group.gondola)}" data-expiry-shelf="${escapeHtml(group.shelf)}" ${group.count ? "" : "disabled"}>${group.dated}/${group.count} dated <b>›</b></button></div>`).join("") || `<div class="shelf-row"><span>Add a gondola to build your guide.</span></div>`;
  $("#shelfGuide").hidden = shelfGuideCollapsed;
  $("#guide").classList.toggle("collapsed", shelfGuideCollapsed);
  const shelfToggle = $("#toggleShelfGuide");
  shelfToggle.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${shelfGuideCollapsed ? "m6 9 6 6 6-6" : "m6 15 6-6 6 6"}"/></svg>`;
  shelfToggle.setAttribute("aria-expanded", String(!shelfGuideCollapsed));
  shelfToggle.setAttribute("aria-label", shelfGuideCollapsed ? "Expand shelf guide" : "Collapse shelf guide");
  shelfToggle.title = shelfGuideCollapsed ? "Expand shelf guide" : "Minimize shelf guide";
}
function renderLocationLists() { const gondolas = [...locations].sort((a, b) => a.gondola.localeCompare(b.gondola)); $("#gondolaList").innerHTML = gondolas.map((item) => `<option value="${escapeHtml(item.gondola)}"></option>`).join(""); const selected = gondolas.find((item) => item.gondola.toLowerCase() === $("#gondolaInput").value.trim().toLowerCase()); const shelves = selected ? selected.shelves : [...new Set(gondolas.flatMap((item) => item.shelves))]; $("#shelfList").innerHTML = shelves.sort().map((shelf) => `<option value="${escapeHtml(shelf)}"></option>`).join(""); }
function renderGondolaManager() { const sorted = [...locations].sort((a, b) => a.gondola.localeCompare(b.gondola)); $("#gondolaCount").textContent = `${sorted.length} gondola${sorted.length === 1 ? "" : "s"}`; $("#gondolaListView").innerHTML = sorted.map((item) => `<div class="gondola-item"><strong>${escapeHtml(item.gondola)}</strong><div>${item.shelves.sort().map((shelf) => `<span>${escapeHtml(shelf)}</span>`).join("")}</div></div>`).join("") || `<p class="no-gondolas">No gondolas configured yet.</p>`; }
function openOrganizer() { if (!locations.length) { toast("Add a gondola and shelves first"); return; } loadOrganizerLayout(); const select = $("#organizeGondola"); const preferred = localStorage.getItem("medimap-organizer-gondola") || select.value; select.innerHTML = [...locations].sort((a, b) => a.gondola.localeCompare(b.gondola)).map((item) => `<option value="${escapeHtml(item.gondola)}">${escapeHtml(item.gondola)}</option>`).join(""); if ([...select.options].some((option) => option.value === preferred)) select.value = preferred; localStorage.setItem("medimap-organizer-gondola", select.value); organizeActiveCell = null; $("#organizeSearch").value = ""; renderOrganizer(); $("#exportOrganize").disabled = false; $("#organizeDialog").showModal(); }
function renderOrganizer() { const gondola = $("#organizeGondola").value; const location = locations.find((item) => item.gondola === gondola); if (!location) return; const shelves = [...location.shelves].sort((a, b) => a.localeCompare(b)); const placements = new Map(); organizePlacements.forEach((placement, medicineId) => { if (placement.gondola === gondola) placements.set(`${placement.shelf}\u0000${placement.row}`, medicines.find((item) => item.id === medicineId)); }); $("#organizeGrid").innerHTML = shelves.length ? `<div class="organize-shelves">${shelves.map((shelf) => { const highestUsedRow = Math.max(-1, ...[...organizePlacements.values()].filter((placement) => placement.gondola === gondola && placement.shelf === shelf).map((placement) => placement.row)); const rowCount = Math.max(8, organizerRowCounts[organizerShelfKey(gondola, shelf)] || 0, highestUsedRow + 1); return `<section class="organize-shelf"><h3>${escapeHtml(shelf)}</h3><div class="organize-column-head"><span>Medicine</span><span>Expiry</span><span></span></div>${Array.from({ length: rowCount }, (_, row) => { const item = placements.get(`${shelf}\u0000${row}`); const draftKey = organizerDraftKey(gondola, shelf, row); return `<div class="organize-entry${item && organizerSelectedIds.has(item.id) ? " selected" : ""}" data-organize-cell="${escapeHtml(shelf)}" data-organize-row="${row}">${item ? `<div class="organize-select-cell"><input type="checkbox" data-select-organized="${item.id}" ${organizerSelectedIds.has(item.id) ? "checked" : ""} aria-label="Select ${escapeHtml(item.name)}"><span class="organize-drag-handle" draggable="true" data-drag-medicine="${item.id}" title="Drag to reorder">⋮⋮</span></div><input class="organize-name-input" data-organize-name-id="${item.id}" value="${escapeHtml(organizerDrafts[`name:${item.id}`] ?? item.name)}" aria-label="Medicine name"><input class="organize-expiry-input" inputmode="text" autocapitalize="off" data-organize-expiry-id="${item.id}" value="${escapeHtml(organizerDrafts[`expiry:${item.id}`] ?? getExpiries(item).map(formatExpiry).join(", "))}" placeholder="MM/YYYY" aria-label="Expiry for ${escapeHtml(item.name)}"><div class="organize-move-buttons"><button type="button" data-move-organizer="up" data-medicine-id="${item.id}" ${row === 0 ? "disabled" : ""} aria-label="Move ${escapeHtml(item.name)} up">↑</button><button type="button" data-move-organizer="down" data-medicine-id="${item.id}" ${row === rowCount - 1 ? "disabled" : ""} aria-label="Move ${escapeHtml(item.name)} down">↓</button></div>` : `<div class="organize-row-number">${row + 1}</div><input class="organize-name-input" list="organizeMedicineOptions" data-organize-input="${escapeHtml(shelf)}" data-organize-row="${row}" value="${escapeHtml(organizerDrafts[draftKey] || "")}" placeholder="Type medicine" aria-label="Medicine for ${escapeHtml(shelf)}, row ${row + 1}"><input class="organize-expiry-input" placeholder="MM/YYYY" disabled aria-label="Add medicine first"><span></span>`}</div>${row < rowCount - 1 ? `<button class="organize-insert-row" type="button" data-insert-organizer-row="${row + 1}" data-insert-organizer-shelf="${escapeHtml(shelf)}" aria-label="Insert a blank row between rows ${row + 1} and ${row + 2}" title="Insert row here"><span>+</span><b>Insert row</b></button>` : ""}`; }).join("")}<button class="organize-add-row" type="button" data-add-organizer-row="${escapeHtml(shelf)}">＋ Add another row</button></section>`; }).join("")}</div>` : `<p class="organize-list-empty">This gondola has no shelves yet.</p>`; $("#organizeMedicineOptions").innerHTML = medicines.map((item) => `<option value="${escapeHtml(item.name)}"></option>`).join(""); $("#exportOrganize").disabled = organizePlacements.size === 0; renderOrganizerMedicineList(); updateOrganizerHint(); updateOrganizerSelectionControls(); }
function updateOrganizerSelectionControls() { const gondola = $("#organizeGondola").value; const arrangedIds = [...organizePlacements].filter(([, placement]) => placement.gondola === gondola).map(([id]) => id); [...organizerSelectedIds].forEach((id) => { if (!arrangedIds.includes(id)) organizerSelectedIds.delete(id); }); const count = organizerSelectedIds.size; $("#organizedSelectionCount").textContent = `${count} selected`; $("#deleteOrganized").disabled = count === 0; $("#selectAllOrganized").disabled = arrangedIds.length === 0; $("#selectAllOrganized").textContent = arrangedIds.length && arrangedIds.every((id) => organizerSelectedIds.has(id)) ? "Clear selection" : "Select all"; }
function renderOrganizerMedicineList() { const query = $("#organizeSearch").value.trim().toLowerCase(); const gondola = $("#organizeGondola").value; const gondolaMedicines = medicines.filter((item) => item.gondola === gondola); const items = gondolaMedicines.filter((item) => `${item.name} ${item.genericName || ""} ${item.category}`.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name)); $("#organizeMedicineOptions").innerHTML = gondolaMedicines.map((item) => `<option value="${escapeHtml(item.name)}"></option>`).join(""); $("#organizeMedicineList").innerHTML = items.map((item) => `<button class="organize-list-item" type="button" data-organize-medicine="${item.id}"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.shelf)}${item.genericName ? ` · ${escapeHtml(item.genericName)}` : ""}</small></button>`).join("") || `<p class="organize-list-empty">No medicines found in ${escapeHtml(gondola)}.</p>`; }
function updateOrganizerHint() { const hint = $("#organizeHint"); const wrapper = hint.parentElement; if (organizeActiveCell) { hint.textContent = `Selected: ${organizeActiveCell.gondola} · ${organizeActiveCell.shelf} · Slot ${organizeActiveCell.row + 1}`; wrapper.classList.add("active"); } else { hint.textContent = "Select a blank shelf cell to begin"; wrapper.classList.remove("active"); } }
function medicineAtOrganizerCell(gondola, shelf, row) { for (const [id, placement] of organizePlacements) if (placement.gondola === gondola && placement.shelf === shelf && placement.row === row) return medicines.find((item) => item.id === id); return null; }
function organizerShelfKey(gondola, shelf) { return `${gondola}\u0000${shelf}`; }
function organizerDraftKey(gondola, shelf, row) { return `new:${gondola}\u0000${shelf}\u0000${row}`; }
function persistOrganizerExtras() { localStorage.setItem("medimap-organizer-row-counts", JSON.stringify(organizerRowCounts)); localStorage.setItem("medimap-organizer-drafts", JSON.stringify(organizerDrafts)); }
function insertOrganizerRow(gondola, shelf, row) { const key = organizerShelfKey(gondola, shelf); const prefix = `new:${gondola}\u0000${shelf}\u0000`; [...organizePlacements].filter(([, placement]) => placement.gondola === gondola && placement.shelf === shelf && placement.row >= row).sort((a, b) => b[1].row - a[1].row).forEach(([id, placement]) => { const shifted = { ...placement, row: placement.row + 1 }; organizePlacements.set(id, shifted); const item = medicines.find((medicine) => medicine.id === id); if (item) item.organizeSlot = shifted; }); Object.keys(organizerDrafts).filter((draftKey) => draftKey.startsWith(prefix) && Number(draftKey.slice(prefix.length)) >= row).sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length))).forEach((draftKey) => { const shiftedKey = `${prefix}${Number(draftKey.slice(prefix.length)) + 1}`; organizerDrafts[shiftedKey] = organizerDrafts[draftKey]; delete organizerDrafts[draftKey]; }); organizerRowCounts[key] = Math.max(8, organizerRowCounts[key] || 8) + 1; organizeActiveCell = { gondola, shelf, row }; persist(); persistOrganizerLayout(); persistOrganizerExtras(); render(); renderOrganizer(); setTimeout(() => [...document.querySelectorAll("[data-organize-input]")].find((field) => field.dataset.organizeInput === shelf && Number(field.dataset.organizeRow) === row)?.focus(), 0); toast(`Blank row inserted in ${shelf}`); }
function moveOrganizerMedicine(medicineId, target) { const item = medicines.find((medicine) => medicine.id === medicineId); const source = organizePlacements.get(medicineId); if (!item || !source || (source.gondola === target.gondola && source.shelf === target.shelf && source.row === target.row)) return; const targetItem = medicineAtOrganizerCell(target.gondola, target.shelf, target.row); if (targetItem) { targetItem.organizeSlot = { ...source }; targetItem.gondola = source.gondola; targetItem.shelf = source.shelf; organizePlacements.set(targetItem.id, targetItem.organizeSlot); } item.organizeSlot = { ...target }; item.gondola = target.gondola; item.shelf = target.shelf; organizePlacements.set(item.id, item.organizeSlot); addLocation(target.gondola, target.shelf); persist(); persistLocations(); persistOrganizerLayout(); render(); renderOrganizer(); toast(targetItem ? `${item.name} and ${targetItem.name} swapped` : `${item.name} moved`); }
function placeMedicineInOrganizer(name, medicineId = null) { if (!organizeActiveCell) { toast("Select a blank shelf cell first"); return; } const { gondola, shelf, row } = organizeActiveCell; const typed = String(name || "").trim(); if (!typed && !medicineId) return; let item = medicineId ? medicines.find((medicine) => medicine.id === medicineId && medicine.gondola === gondola) : medicines.find((medicine) => medicine.gondola === gondola && medicine.name.toLowerCase() === typed.toLowerCase()); if (item) { item.shelf = shelf; } else { const now = Date.now(); item = { id: now, name: typed, genericName: "", category: "Uncategorized", gondola, shelf, expiry: "", addedAt: now }; medicines.push(item); } organizePlacements.forEach((placement, id) => { if (placement.gondola === gondola && placement.shelf === shelf && placement.row === row) { const displaced = medicines.find((medicine) => medicine.id === id); if (displaced) delete displaced.organizeSlot; organizePlacements.delete(id); } }); organizePlacements.delete(item.id); item.organizeSlot = { gondola, shelf, row }; organizePlacements.set(item.id, item.organizeSlot); delete organizerDrafts[organizerDraftKey(gondola, shelf, row)]; addLocation(gondola, shelf); persist(); persistLocations(); persistOrganizerLayout(); persistOrganizerExtras(); render(); renderOrganizer(); toast(`${item.name} placed in ${shelf}`); }
function exportOrganizerArrangement() { if (!globalThis.XLSX) { toast("Excel exporter could not load"); return; } const grouped = new Map(); const currentGondola = $("#organizeGondola").value; const currentLocation = locations.find((location) => location.gondola === currentGondola); grouped.set(currentGondola, new Map((currentLocation?.shelves || []).map((shelf) => [shelf, []]))); organizePlacements.forEach((placement, medicineId) => { const item = medicines.find((medicine) => medicine.id === medicineId); if (!item) return; if (!grouped.has(placement.gondola)) grouped.set(placement.gondola, new Map()); const shelves = grouped.get(placement.gondola); if (!shelves.has(placement.shelf)) shelves.set(placement.shelf, []); shelves.get(placement.shelf).push({ row: placement.row, item }); }); const workbook = XLSX.utils.book_new(); [...grouped].sort(([a], [b]) => a.localeCompare(b)).forEach(([gondola, shelves]) => { const rows = [[`GONDOLA ${gondola}`, ""], ["", ""]]; const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]; [...shelves].sort(([a], [b]) => a.localeCompare(b)).forEach(([shelf, entries], shelfIndex) => { if (shelfIndex) rows.push(["", ""]); const shelfRow = rows.length; rows.push([shelf.toUpperCase(), ""]); merges.push({ s: { r: shelfRow, c: 0 }, e: { r: shelfRow, c: 1 } }); rows.push(["Medicine", "Expiry"]); entries.sort((a, b) => a.row - b.row).forEach(({ item }) => rows.push([item.name, getExpiries(item).map(formatExpiry).join(", ")])); }); const sheet = XLSX.utils.aoa_to_sheet(rows); sheet["!merges"] = merges; sheet["!cols"] = [{ wch: 38 }, { wch: 24 }]; sheet["!rows"] = rows.map((_, index) => ({ hpt: index === 0 ? 26 : 20 })); const safeName = `Gondola ${gondola}`.replace(/[\\/?*\[\]:]/g, "-").slice(0, 31); XLSX.utils.book_append_sheet(workbook, sheet, safeName); }); const stamp = new Date().toISOString().slice(0, 10); XLSX.writeFile(workbook, `MediMap_Organized_Arrangement_${stamp}.xlsx`); toast("Arrangement exported to Excel"); }

function exportOrganizerArrangementReference() {
  if (!globalThis.XLSX) { toast("Excel exporter could not load"); return; }
  const grouped = new Map(locations.map((location) => [location.gondola, new Map(location.shelves.map((shelf) => [shelf, []]))]));
  organizePlacements.forEach((placement, medicineId) => {
    const item = medicines.find((medicine) => medicine.id === medicineId);
    if (!item) return;
    if (!grouped.has(placement.gondola)) grouped.set(placement.gondola, new Map());
    const shelves = grouped.get(placement.gondola);
    if (!shelves.has(placement.shelf)) shelves.set(placement.shelf, []);
    shelves.get(placement.shelf).push({ row: placement.row, item });
  });
  const workbook = XLSX.utils.book_new();
  [...grouped].filter(([, shelves]) => [...shelves.values()].some((entries) => entries.length)).sort(([a], [b]) => a.localeCompare(b)).forEach(([gondola, shelves]) => {
    const rows = [];
    const shelfHeaderRows = new Set();
    [...shelves].sort(([a], [b]) => a.localeCompare(b)).forEach(([shelf, entries]) => {
      shelfHeaderRows.add(rows.length);
      rows.push([shelf.toUpperCase(), "", "", "", "", "", "", "", ""]);
      entries.sort((a, b) => a.row - b.row).forEach(({ item }) => {
        const expiries = getExpiries(item);
        if (expiries.length) expiries.forEach((expiry) => rows.push([item.name.toUpperCase(), formatExpiry(expiry), "", "", "", "", "", "", ""]));
        else rows.push([item.name.toUpperCase(), "", "", "", "", "", "", "", ""]);
      });
    });
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 46 }, { wch: 14 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 16 }, { wch: 12 }];
    sheet["!rows"] = rows.map((_, index) => ({ hpt: shelfHeaderRows.has(index) ? 22 : 20 }));
    sheet["!margins"] = { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    sheet["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:I1");
    for (let row = range.s.r; row <= range.e.r; row++) for (let column = range.s.c; column <= range.e.c; column++) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (!sheet[address]) sheet[address] = { t: "s", v: "" };
      sheet[address].s = { font: { name: "Tahoma", sz: shelfHeaderRows.has(row) && column === 0 ? 11 : 10, bold: shelfHeaderRows.has(row) && column === 0 }, fill: column === 0 ? { patternType: "solid", fgColor: { rgb: "F9DBDF" } } : undefined, alignment: { horizontal: column === 0 ? "left" : "center", vertical: "center" }, border: { top: { style: "thin", color: { rgb: "000000" } }, bottom: { style: "thin", color: { rgb: "000000" } }, left: { style: "thin", color: { rgb: "000000" } }, right: { style: "thin", color: { rgb: "000000" } } } };
    }
    const safeName = `Gondola ${gondola}`.replace(/[\\/?*\[\]:]/g, "-").slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, sheet, safeName);
  });
  if (!workbook.SheetNames.length) { toast("No arranged medicines to export"); return; }
  XLSX.writeFile(workbook, `MediMap_Gondola_Arrangement_${new Date().toISOString().slice(0, 10)}.xlsx`, { cellStyles: true });
  toast("Arrangement exported in the Gondola shelf format");
}

function exportOrganizerArrangementDocumentStyle() {
  const gondola = $("#organizeGondola").value;
  const location = locations.find((item) => item.gondola === gondola);
  if (!gondola || !location) { toast("Choose a gondola to export"); return; }
  const arranged = [...organizePlacements].filter(([, placement]) => placement.gondola === gondola);
  if (!arranged.length) { toast("No arranged medicines to export"); return; }
  const rows = [`<tr class="metadata"><td>GONDOLA ${escapeHtml(gondola)}</td>${"<td></td>".repeat(8)}</tr>`];
  [...location.shelves].sort((a, b) => a.localeCompare(b)).forEach((shelf) => {
    rows.push(`<tr class="shelf"><td>${escapeHtml(shelf.toUpperCase())}</td>${"<td></td>".repeat(8)}</tr>`);
    arranged.filter(([, placement]) => placement.shelf === shelf).sort(([, a], [, b]) => a.row - b.row).forEach(([medicineId]) => {
      const item = medicines.find((medicine) => medicine.id === medicineId);
      if (!item) return;
      const expiries = getExpiries(item);
      (expiries.length ? expiries : [""]).forEach((expiry) => rows.push(`<tr><td>${escapeHtml(item.name.toUpperCase())}</td><td>${escapeHtml(formatExpiry(expiry))}</td><td></td>${"<td></td>".repeat(6)}</tr>`));
    });
  });
  const html = `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>@page{size:landscape;margin:.5in}body{margin:0;font-family:Tahoma,Arial,sans-serif}table{border-collapse:collapse;table-layout:fixed;width:100%}col:nth-child(1){width:34%}col:nth-child(2){width:10%}col:nth-child(3){width:8%}col:nth-child(4){width:10%}col:nth-child(5),col:nth-child(6),col:nth-child(7){width:8%}col:nth-child(8){width:12%}col:nth-child(9){width:10%}td{border:1px solid #000;height:20px;padding:2px 4px;font-size:10pt;vertical-align:middle}td:first-child{background:#F9DBDF;text-align:left}td:not(:first-child){text-align:center}.shelf td:first-child{font-size:11pt;font-weight:bold}.metadata{display:none}</style></head><body><table><colgroup>${"<col>".repeat(9)}</colgroup><tbody>${rows.join("")}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MediMap_Gondola_${gondola.replace(/[^a-z0-9_-]+/gi, "-")}_${new Date().toISOString().slice(0, 10)}.xls`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`${gondola} exported in the reference format`);
}

async function importOrganizerArrangement(file) {
  if (!globalThis.XLSX) { toast("Excel importer could not load"); return; }
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const entries = [];
    const seen = new Map();
    const addEntry = (gondola, shelf, name, expiry, row) => {
      gondola = String(gondola || "").trim(); shelf = String(shelf || "").trim(); name = String(name || "").trim();
      if (!gondola || !shelf || !name) return;
      const key = `${gondola.toLowerCase()}\u0000${shelf.toLowerCase()}\u0000${name.toLowerCase()}`;
      const expiries = parseExpiryList(expiry);
      if (seen.has(key)) { const existing = seen.get(key); existing.expiries = [...new Set([...existing.expiries, ...expiries])].sort(); return; }
      const entry = { gondola, shelf, name, expiries, row }; entries.push(entry); seen.set(key, entry);
    };
    workbook.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      const title = String(rows[0]?.[0] || "").trim();
      const fixedGondola = (/^GONDOLA\s+(.+)/i.exec(title)?.[1] || /^Gondola\s+(.+)/i.exec(sheetName)?.[1] || "").trim();
      let activeShelf = "";
      let activeShelfRow = 0;
      let foundShelfBlocks = false;
      rows.forEach((row) => {
        const first = String(row[0] || "").trim();
        const second = String(row[1] || "").trim();
        if (/^SHELF\s+/i.test(first)) { activeShelf = first; activeShelfRow = 0; foundShelfBlocks = true; return; }
        if (!activeShelf || !first || (normalizeImportHeader(first) === "medicine" && normalizeImportHeader(second) === "expiry")) return;
        addEntry(fixedGondola, activeShelf, first, second, activeShelfRow++);
      });
      if (foundShelfBlocks) return;
      let foundSections = false;
      rows.forEach((row, index) => {
        if (normalizeImportHeader(row[0]) !== "medicine" || normalizeImportHeader(row[1]) !== "expiry") return;
        let shelf = "";
        for (let previous = index - 1; previous >= 0; previous--) { shelf = String(rows[previous]?.[0] || "").trim(); if (shelf) break; }
        if (!fixedGondola || !shelf) return;
        foundSections = true;
        let shelfRow = 0;
        for (let next = index + 1; next < rows.length; next++) {
          const name = String(rows[next]?.[0] || "").trim();
          const expiry = String(rows[next]?.[1] || "").trim();
          if (!name && !expiry) break;
          if (name) addEntry(fixedGondola, shelf, name, expiry, shelfRow++);
        }
      });
      if (foundSections) return;
      const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeImportHeader(cell) === "shelf") && row.some((cell) => ["medicine", "medicinename"].includes(normalizeImportHeader(cell))));
      if (headerIndex < 0) return;
      const headers = rows[headerIndex].map(normalizeImportHeader);
      const shelfCol = headers.indexOf("shelf");
      const medicineCol = headers.findIndex((header) => ["medicine", "medicinename"].includes(header));
      const expiryCol = headers.indexOf("expiry");
      const gondolaCol = headers.indexOf("gondola");
      const shelfRows = new Map();
      rows.slice(headerIndex + 1).forEach((row) => {
        const gondola = gondolaCol >= 0 ? row[gondolaCol] : fixedGondola;
        const shelf = String(row[shelfCol] || "").trim();
        const shelfKey = `${gondola}\u0000${shelf}`;
        const rowNumber = shelfRows.get(shelfKey) || 0;
        addEntry(gondola, shelf, row[medicineCol], expiryCol >= 0 ? row[expiryCol] : "", rowNumber);
        if (String(row[medicineCol] || "").trim()) shelfRows.set(shelfKey, rowNumber + 1);
      });
    });
    if (!entries.length) throw new Error("No arranged medicine rows were found");
    const importedGondolas = [...new Set(entries.map((entry) => entry.gondola))];
    if (!confirm(`Import ${entries.length} arranged medicine${entries.length === 1 ? "" : "s"} across ${importedGondolas.length} gondola${importedGondolas.length === 1 ? "" : "s"}? Existing arrangements for those gondolas will be replaced.`)) return;
    organizePlacements.forEach((placement, id) => { if (!importedGondolas.includes(placement.gondola)) return; organizePlacements.delete(id); const item = medicines.find((medicine) => medicine.id === id); if (item) delete item.organizeSlot; });
    const now = Date.now();
    entries.forEach((entry, index) => {
      addLocation(entry.gondola, entry.shelf);
      let item = medicines.find((medicine) => medicine.gondola.toLowerCase() === entry.gondola.toLowerCase() && medicine.name.toLowerCase() === entry.name.toLowerCase());
      if (!item) { item = { id: now + index, name: entry.name, genericName: "", category: "Uncategorized", gondola: entry.gondola, shelf: entry.shelf, expiry: "", addedAt: now + index }; medicines.push(item); }
      item.gondola = entry.gondola; item.shelf = entry.shelf;
      if (entry.expiries.length) { item.expiries = [...new Set([...getExpiries(item), ...entry.expiries])].sort(); item.expiry = item.expiries[0] || ""; }
      item.organizeSlot = { gondola: entry.gondola, shelf: entry.shelf, row: entry.row };
      organizePlacements.set(item.id, item.organizeSlot);
    });
    organizerSelectedIds.clear(); persist(); persistLocations(); persistOrganizerLayout();
    const gondolaSelect = $("#organizeGondola");
    gondolaSelect.innerHTML = [...locations].sort((a, b) => a.gondola.localeCompare(b.gondola)).map((item) => `<option value="${escapeHtml(item.gondola)}">${escapeHtml(item.gondola)}</option>`).join("");
    gondolaSelect.value = importedGondolas[0]; localStorage.setItem("medimap-organizer-gondola", gondolaSelect.value);
    render(); renderOrganizer(); toast(`${entries.length} arranged medicines imported`);
  } catch (error) { console.error(error); alert(`Could not import this arrangement. ${error.message}. Use a MediMap exported arrangement or columns named Gondola, Shelf, Medicine, and Expiry.`); }
}

function escapeHtml(value) { const div = document.createElement("div"); div.textContent = String(value); return div.innerHTML; }
function sidebarToggleIcon(open) { return open ? `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>` : `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`; }
function formatExpiry(value) { if (!value || !/^\d{4}-\d{2}$/.test(value)) return ""; const [year, month] = value.split("-"); return `${month}/${year}`; }
function expiryStatus(value) { const [year, month] = value.split("-").map(Number); const expiryEnd = new Date(year, month, 0); const today = new Date(); const warning = new Date(today.getFullYear(), today.getMonth() + 4, 0); return expiryEnd < today ? "expired" : expiryEnd <= warning ? "expiring" : ""; }
function getExpiries(item) { return [...new Set([...(Array.isArray(item.expiries) ? item.expiries : []), item.expiry].filter((value) => /^\d{4}-\d{2}$/.test(value)))].sort(); }
function combinedExpiryStatus(item) { const statuses = getExpiries(item).map(expiryStatus); return statuses.includes("expired") ? "expired" : statuses.includes("expiring") ? "expiring" : ""; }
function expiryReportStatus(value) { const status = expiryStatus(value); return status === "expired" ? "Expired" : status === "expiring" ? "Near expiry" : "Scheduled"; }
function renderNearExpiryReport() {
  const month = $("#nearExpiryMonth").value;
  const year = $("#nearExpiryYear").value;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const warning = new Date(today.getFullYear(), today.getMonth() + 4, 0);
  const rows = medicines.flatMap((item) => getExpiries(item).map((expiry) => ({ item, expiry }))).filter(({ expiry }) => {
    const [expiryYear, expiryMonth] = expiry.split("-");
    if (month || year) return (!month || expiryMonth === month) && (!year || expiryYear === year);
    const [y, m] = expiry.split("-").map(Number);
    return new Date(y, m, 0) <= warning;
  }).sort((a, b) => a.item.gondola.localeCompare(b.item.gondola) || a.expiry.localeCompare(b.expiry) || a.item.name.localeCompare(b.item.name));
  const groups = new Map();
  rows.forEach((row) => { if (!groups.has(row.item.gondola)) groups.set(row.item.gondola, []); groups.get(row.item.gondola).push(row); });
  const expiredCount = rows.filter(({ expiry }) => expiryStatus(expiry) === "expired").length;
  $("#nearExpiryBody").innerHTML = [...groups].map(([gondola, entries]) => `<tr class="near-expiry-group"><th colspan="5">${escapeHtml(gondola)} <span>${entries.length} expiry batch${entries.length === 1 ? "" : "es"}</span></th></tr>${entries.map(({ item, expiry }) => { const expired = expiryStatus(expiry) === "expired"; return `<tr class="${expired ? "expired-report-row" : ""}"><td data-label="Medicine"><strong>${escapeHtml(item.name)}</strong>${item.genericName ? `<small>${escapeHtml(item.genericName)}</small>` : ""}</td><td data-label="Shelf">${escapeHtml(item.shelf)}</td><td data-label="Expiry">${formatExpiry(expiry)}</td><td data-label="Status"><span class="report-status ${expiryStatus(expiry)}">${expiryReportStatus(expiry)}</span>${expired ? `<small class="stock-check-note">Double-check for new stock</small>` : ""}</td><td data-label="Action">${expired ? `<button class="update-stock-button" type="button" data-update-stock="${item.id}" data-old-expiry="${expiry}">Update stock</button>` : "—"}</td></tr>`; }).join("")}`).join("");
  $("#nearExpiryEmpty").hidden = rows.length > 0;
  $("#nearExpirySummary").innerHTML = `<strong>${rows.length}</strong><span>expiry batch${rows.length === 1 ? "" : "es"}</span><strong>${groups.size}</strong><span>gondola${groups.size === 1 ? "" : "s"}</span>${expiredCount ? `<strong class="expired-count">${expiredCount}</strong><span>need stock checks</span>` : ""}`;
}
function openNearExpiryReport() { const years = [...new Set(medicines.flatMap((item) => getExpiries(item).map((expiry) => expiry.slice(0, 4))))].sort((a, b) => b.localeCompare(a)); $("#nearExpiryYear").innerHTML = `<option value="">All years</option>` + years.map((year) => `<option value="${year}">${year}</option>`).join(""); $("#nearExpiryMonth").value = ""; $("#nearExpiryYear").value = ""; renderNearExpiryReport(); $("#nearExpiryDialog").showModal(); }
function parseExpiryList(value) { return [...new Set(String(value || "").split(/[,;\n]+/).map((part) => parseImportedExpiry(part)).filter(Boolean))].sort(); }
function consolidateMedicineBatches() { const merged = new Map(); medicines.forEach((item) => { const key = [item.name, item.gondola, item.shelf].map((value) => String(value || "").trim().toLowerCase()).join("\u0000"); const expiries = getExpiries(item); if (!merged.has(key)) { merged.set(key, { ...item, expiries, expiry: expiries[0] || "" }); return; } const base = merged.get(key); base.expiries = [...new Set([...getExpiries(base), ...expiries])].sort(); base.expiry = base.expiries[0] || ""; if (!base.genericName && item.genericName) base.genericName = item.genericName; if ((!base.category || base.category === "Uncategorized") && item.category) base.category = item.category; if (!base.organizeSlot && item.organizeSlot) base.organizeSlot = item.organizeSlot; }); medicines = [...merged.values()]; }
function persist() { localStorage.setItem("medicine-finder-inventory", JSON.stringify(medicines)); }
function persistLocations() { localStorage.setItem("medimap-locations", JSON.stringify(locations)); }
function persistCategories() { localStorage.setItem("medimap-categories", JSON.stringify(categoryChoices)); }
function persistCategoryDescriptions() { localStorage.setItem("medimap-category-descriptions", JSON.stringify(categoryDescriptions)); }
function persistOrganizerLayout() { localStorage.setItem("medimap-organizer-layout", JSON.stringify([...organizePlacements])); }
function loadOrganizerLayout() { try { const saved = JSON.parse(localStorage.getItem("medimap-organizer-layout") || "[]"); const legacy = new Map(Array.isArray(saved) ? saved.map(([id, placement]) => [Number(id), placement]) : []); medicines.forEach((medicine) => { if (!medicine.organizeSlot && legacy.has(medicine.id)) medicine.organizeSlot = legacy.get(medicine.id); }); organizePlacements = new Map(medicines.filter((medicine) => medicine.organizeSlot).map((medicine) => [medicine.id, medicine.organizeSlot])); persist(); persistOrganizerLayout(); } catch (error) { console.error("Could not restore organizer layout", error); organizePlacements = new Map(medicines.filter((medicine) => medicine.organizeSlot).map((medicine) => [medicine.id, medicine.organizeSlot])); } }
function updateViewButtons() { $("#gridView").classList.toggle("active", viewMode === "grid"); $("#listView").classList.toggle("active", viewMode === "list"); }
function renderCategoryEditor() { $("#categoryEditorList").innerHTML = categoryChoices.map((category, index) => `<div class="category-editor-row"><input value="${escapeHtml(category)}" data-category-index="${index}" aria-label="Category name"><textarea data-category-description="${index}" rows="2" maxlength="240" placeholder="Add a short category description…" aria-label="Description for ${escapeHtml(category)}">${escapeHtml(categoryDescriptions[category] || "")}</textarea><button type="button" data-save-category="${index}">Save</button><button class="remove-category" type="button" data-remove-category="${index}" ${category === "Uncategorized" ? "disabled" : ""}>×</button></div>`).join(""); }
function renderCategoryGuide() { const query = $("#categoryGuideSearch").value.trim().toLowerCase(); const categories = [...categoryChoices].sort((a, b) => a.localeCompare(b)).filter((category) => `${category} ${categoryDescriptions[category] || ""}`.toLowerCase().includes(query)); $("#categoryGuideCount").textContent = `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`; $("#categoryGuideList").innerHTML = categories.map((category) => `<article class="category-guide-item"><strong>${escapeHtml(category)}</strong><p>${escapeHtml(categoryDescriptions[category] || "No description has been added yet.")}</p></article>`).join("") || `<div class="category-guide-empty">No matching categories found.</div>`; }
function renderCustomPharmacyName() { const name = customPharmacyName.trim(); $("#brandCustomName").textContent = name; $("#brandCustomName").hidden = !name; }
function openMedicineSummary(item) { if (!item) return; editingMedicineId = item.id; const category = item.category || "Uncategorized"; $("#summaryBrandName").textContent = item.name; $("#summaryLocation").textContent = `${item.gondola} · ${item.shelf}`; $("#summaryBrand").textContent = item.name; $("#summaryGeneric").textContent = item.genericName || "Not provided"; $("#summaryCategory").textContent = category; $("#summaryCategoryDescription").textContent = categoryDescriptions[category] || "No category description has been added."; $("#summaryExpiry").textContent = getExpiries(item).map(formatExpiry).join(", ") || "No expiry recorded"; $("#medicineSummaryDialog").showModal(); }
function openEditMedicine() { const item = medicines.find((medicine) => medicine.id === editingMedicineId); if (!item) return; $("#editMedicineName").value = item.name; $("#editGenericName").value = item.genericName || ""; const categories = [...new Set([...categoryChoices, ...medicines.map((medicine) => medicine.category || "Uncategorized")])].sort((a, b) => a.localeCompare(b)); $("#editMedicineCategory").innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join(""); $("#editMedicineCategory").value = item.category || "Uncategorized"; $("#editMedicineGondola").value = item.gondola; $("#editMedicineShelf").value = item.shelf; $("#editMedicineExpiry").value = getExpiries(item).map(formatExpiry).join(", "); $("#medicineSummaryDialog").close(); $("#editMedicineDialog").showModal(); setTimeout(() => $("#editMedicineName").focus(), 50); }
function updateSettingsSummary() { $("#settingsView").value = viewMode; $("#settingsCustomName").value = customPharmacyName; $("#settingsMedicineCount").textContent = medicines.length; $("#settingsGondolaCount").textContent = locations.length; $("#settingsCategoryCount").textContent = categoryChoices.length; $("#settingsAppVersion").textContent = `Version ${APP_VERSION}`; }
function renderAppVersion() { $("#sidebarAppVersion").textContent = `Version ${APP_VERSION}`; $("#settingsAppVersion").textContent = `Version ${APP_VERSION}`; }
function updateSelectionBar() { const count = selectedIds.size; document.body.classList.toggle("selection-mode", selectionMode || count > 0); $("#bulkBar").hidden = count === 0; $("#selectedCount").textContent = `${count} selected`; $("#selectAll").textContent = medicines.length && count === medicines.length ? "Deselect all" : "Select all"; $("#mobileSelectMode").classList.toggle("active", selectionMode || count > 0); $("#mobileSelectMode").innerHTML = count ? `<svg class="ui-icon" viewBox="0 0 24 24"><path d="m6 12 3 3 8-8"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>${count}` : `<svg class="ui-icon" viewBox="0 0 24 24"><path d="m6 12 3 3 8-8"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>Select`; }
function openDialog() { $("#addDialog").showModal(); setTimeout(() => $("#bulkNames").focus(), 50); }
function closeDialog() { $("#addDialog").close(); $("#medicineForm").reset(); $("#categoryInput").value = "Uncategorized"; $("#inlineCategoryField").hidden = true; updateLineCount(); }
function updateLineCount() { const count = $("#bulkNames").value.split(/\r?\n/).filter((line) => line.trim()).length; $("#lineCount").textContent = `${count} medicine${count === 1 ? "" : "s"} detected`; $("#saveMedicinesLabel").textContent = count ? `Add ${count} medicine${count === 1 ? "" : "s"}` : "Add medicines"; }
function toast(message, actionLabel = "", action = null, duration = 2600) { const el = $("#toast"); $("#toastMessage").textContent = message; const button = $("#toastAction"); button.hidden = !action; button.textContent = actionLabel || "Undo"; undoOperation = action; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.classList.remove("show"); undoOperation = null; }, duration); }
function showImportSkeleton() { grid.classList.add("import-loading"); grid.innerHTML = Array.from({ length: 6 }, () => `<div class="skeleton-card" aria-hidden="true"></div>`).join(""); $("#resultCount").textContent = "Importing medicines…"; }
function openExpiryDialog(gondola, shelf) { activeExpiryLocation = { gondola, shelf }; const items = medicines.filter((item) => item.gondola === gondola && item.shelf === shelf).sort((a, b) => a.name.localeCompare(b.name)); $("#expiryLocation").textContent = `${gondola} · ${shelf}`; $("#expiryTitle").textContent = `Expiry dates for ${gondola}`; $("#expiryList").innerHTML = items.map((item) => `<label class="expiry-row"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category || "Uncategorized")}</small></span><input type="text" inputmode="text" autocapitalize="off" data-expiry-id="${item.id}" value="${escapeHtml(getExpiries(item).map(formatExpiry).join(", "))}" placeholder="MM/YYYY, MM/YYYY" aria-label="Expiry dates for ${escapeHtml(item.name)}"></label>`).join(""); updateExpiryProgress(); $("#expiryDialog").showModal(); }
function updateExpiryProgress() { const inputs = [...document.querySelectorAll("[data-expiry-id]")]; const completed = inputs.filter((input) => input.value).length; $("#expiryProgress").textContent = `${completed} of ${inputs.length} completed`; }
function closeExpiryDialog() { $("#expiryDialog").close(); activeExpiryLocation = null; }
function normalizeImportHeader(value) { return String(value || "").toLowerCase().replace(/\*/g, "").replace(/\([^)]*\)/g, "").replace(/[^a-z]/g, ""); }
function parseImportedExpiry(value) { const text = String(value || "").trim(); if (!text) return ""; const match = text.match(/^(0?[1-9]|1[0-2])[\/-](\d{4})$/); return match ? `${match[2]}-${match[1].padStart(2, "0")}` : ""; }
async function importExcelFile(file) { if (!globalThis.XLSX) { toast("Excel importer could not load"); return; } try { const data = await file.arrayBuffer(); const workbook = XLSX.read(data, { type: "array" }); const sheet = workbook.Sheets["Inventory Upload"] || workbook.Sheets[workbook.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }); const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeImportHeader(cell) === "medicinename")); if (headerIndex < 0) throw new Error("Medicine Name header not found"); const headers = rows[headerIndex].map(normalizeImportHeader); const column = (name) => headers.indexOf(name); const nameCol = column("medicinename"); const genericCol = column("genericname"); const gondolaCol = column("gondola"); const shelfCol = column("shelf"); const categoryCol = column("category"); const descriptionCol = column("categorydescription"); const expiryCol = column("expiry"); if ([nameCol, gondolaCol, shelfCol].some((index) => index < 0)) throw new Error("Required columns are missing"); let skipped = 0; const imported = rows.slice(headerIndex + 1).map((row) => ({ name: String(row[nameCol] || "").trim(), genericName: genericCol >= 0 ? String(row[genericCol] || "").trim() : "", gondola: String(row[gondolaCol] || "").trim(), shelf: String(row[shelfCol] || "").trim(), category: categoryCol >= 0 ? String(row[categoryCol] || "").trim() || "Uncategorized" : "Uncategorized", categoryDescription: descriptionCol >= 0 ? String(row[descriptionCol] || "").trim() : "", expiry: expiryCol >= 0 ? parseImportedExpiry(row[expiryCol]) : "" })).filter((item) => { const blank = !item.name && !item.gondola && !item.shelf; if (blank || item.name === "Sample Brand 500mg") return false; if (!item.name || !item.gondola || !item.shelf) { skipped++; return false; } return true; }); if (!imported.length) { toast(skipped ? "No valid rows found; check required fields" : "No medicine rows found"); return; } if (!confirm(`Import ${imported.length} medicine${imported.length === 1 ? "" : "s"}${skipped ? ` and skip ${skipped} incomplete row${skipped === 1 ? "" : "s"}` : ""}?`)) return; const now = Date.now(); imported.forEach((item, index) => { const { categoryDescription, ...medicine } = item; medicines.push({ id: now + index, ...medicine, addedAt: now + index }); addLocation(item.gondola, item.shelf); if (!categoryChoices.some((category) => category.toLowerCase() === item.category.toLowerCase())) categoryChoices.push(item.category); if (categoryDescription) categoryDescriptions[item.category] = categoryDescription; }); persist(); persistLocations(); persistCategories(); persistCategoryDescriptions(); activeCategory = "All"; search.value = ""; render(); toast(`${imported.length} medicine${imported.length === 1 ? "" : "s"} imported${skipped ? ` · ${skipped} skipped` : ""}`); } catch (error) { console.error(error); alert(`Could not import this workbook. ${error.message}. Please use the MediMap Excel template and keep its headers unchanged.`); } }
async function importExcelWorkbook(file) {
  if (!globalThis.XLSX) { toast("Excel importer could not load"); return; }
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const imported = [];
    const importedCategoryDescriptions = {};
    let skipped = 0;
    let compatibleSheets = 0;
    workbook.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => ["category", "categorychoices"].includes(normalizeImportHeader(cell))) && row.some((cell) => normalizeImportHeader(cell) === "categorydescription"));
      if (headerIndex < 0) return;
      const headers = rows[headerIndex].map(normalizeImportHeader);
      const categoryCol = headers.findIndex((header) => ["category", "categorychoices"].includes(header));
      const descriptionCol = headers.indexOf("categorydescription");
      rows.slice(headerIndex + 1).forEach((row) => {
        const category = String(row[categoryCol] || "").trim();
        const description = String(row[descriptionCol] || "").trim();
        if (category && description) importedCategoryDescriptions[category] = description;
      });
    });
    workbook.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "" });
      const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeImportHeader(cell) === "medicinename"));
      if (headerIndex < 0) return;
      const headers = rows[headerIndex].map(normalizeImportHeader);
      const column = (name) => headers.indexOf(name);
      const nameCol = column("medicinename");
      const genericCol = column("genericname");
      const gondolaCol = column("gondola");
      const shelfCol = column("shelf");
      const categoryCol = column("category");
      const descriptionCol = column("categorydescription");
      const expiryCol = column("expiry");
      const fixedGondola = String(rows[1]?.[1] || (sheetName.startsWith("Gondola ") ? sheetName.slice(8) : "")).trim();
      if (nameCol < 0 || shelfCol < 0 || (gondolaCol < 0 && !fixedGondola)) return;
      compatibleSheets++;
      rows.slice(headerIndex + 1).forEach((row) => {
        const item = {
          name: String(row[nameCol] || "").trim(),
          genericName: genericCol >= 0 ? String(row[genericCol] || "").trim() : "",
          gondola: gondolaCol >= 0 ? String(row[gondolaCol] || "").trim() : fixedGondola,
          shelf: String(row[shelfCol] || "").trim(),
          category: categoryCol >= 0 ? String(row[categoryCol] || "").trim() || "Uncategorized" : "Uncategorized",
          categoryDescription: (descriptionCol >= 0 ? String(row[descriptionCol] || "").trim() : "") || importedCategoryDescriptions[categoryCol >= 0 ? String(row[categoryCol] || "").trim() || "Uncategorized" : "Uncategorized"] || "",
          expiry: expiryCol >= 0 ? parseImportedExpiry(row[expiryCol]) : "",
        };
        const blank = !item.name && !item.gondola && !item.shelf;
        if (blank || item.name === "Sample Brand 500mg") return;
        if (!item.name || !item.gondola || !item.shelf) { skipped++; return; }
        imported.push(item);
      });
    });
    if (!compatibleSheets) throw new Error("No compatible inventory or gondola sheets were found");
    if (!imported.length) { toast(skipped ? "No valid rows found; check required fields" : "No medicine rows found"); return; }
    if (!confirm(`Import ${imported.length} medicine${imported.length === 1 ? "" : "s"} from ${compatibleSheets} sheet${compatibleSheets === 1 ? "" : "s"}${skipped ? ` and skip ${skipped} incomplete row${skipped === 1 ? "" : "s"}` : ""}?`)) return;
    const now = Date.now();
    Object.entries(importedCategoryDescriptions).forEach(([category, description]) => { if (!categoryChoices.some((choice) => choice.toLowerCase() === category.toLowerCase())) categoryChoices.push(category); categoryDescriptions[category] = description; });
    imported.forEach((item, index) => { const { categoryDescription, ...medicine } = item; medicines.push({ id: now + index, ...medicine, addedAt: now + index }); addLocation(item.gondola, item.shelf); if (!categoryChoices.some((category) => category.toLowerCase() === item.category.toLowerCase())) categoryChoices.push(item.category); if (categoryDescription) categoryDescriptions[item.category] = categoryDescription; });
    consolidateMedicineBatches();
    persist(); persistLocations(); persistCategories(); persistCategoryDescriptions(); activeCategory = "All"; search.value = ""; render();
    toast(`${imported.length} medicine${imported.length === 1 ? "" : "s"} imported from ${compatibleSheets} sheet${compatibleSheets === 1 ? "" : "s"}`);
  } catch (error) { console.error(error); alert(`Could not import this workbook. ${error.message}. Please use the MediMap Excel template and keep its headers unchanged.`); }
}

function exportMediMapData() {
  const backup = { app: "MediMap", version: 1, exportedAt: new Date().toISOString(), medicines, locations, categories: categoryChoices, categoryDescriptions, organizerLayout: [...organizePlacements], organizerRowCounts, organizerDrafts, customPharmacyName, viewMode };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `MediMap_Backup_${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("MediMap backup downloaded");
}

async function importMediMapData(file) {
  try {
    const backup = JSON.parse(await file.text());
    if (backup.app !== "MediMap" || !Array.isArray(backup.medicines) || !Array.isArray(backup.locations)) throw new Error("Not a valid MediMap backup");
    if (!confirm(`Restore ${backup.medicines.length} medicines from this backup? This replaces the data currently stored on this device.`)) return;
    medicines = backup.medicines;
    locations = backup.locations;
    categoryChoices = Array.isArray(backup.categories) ? backup.categories : ["Uncategorized"];
    categoryDescriptions = backup.categoryDescriptions && typeof backup.categoryDescriptions === "object" ? backup.categoryDescriptions : {};
    if (!categoryChoices.includes("Uncategorized")) categoryChoices.push("Uncategorized");
    organizePlacements = new Map(Array.isArray(backup.organizerLayout) ? backup.organizerLayout.map(([id, placement]) => [Number(id), placement]) : medicines.filter((item) => item.organizeSlot).map((item) => [item.id, item.organizeSlot]));
    organizerRowCounts = backup.organizerRowCounts && typeof backup.organizerRowCounts === "object" ? backup.organizerRowCounts : {};
    organizerDrafts = backup.organizerDrafts && typeof backup.organizerDrafts === "object" ? backup.organizerDrafts : {};
    customPharmacyName = String(backup.customPharmacyName || "").slice(0, 60);
    viewMode = backup.viewMode === "list" ? "list" : "grid";
    selectedIds.clear(); activeCategory = "All"; search.value = "";
    persist(); persistLocations(); persistCategories(); persistCategoryDescriptions(); persistOrganizerLayout(); persistOrganizerExtras();
    localStorage.setItem("medimap-custom-name", customPharmacyName); localStorage.setItem("medimap-view", viewMode);
    renderCustomPharmacyName(); render(); updateSettingsSummary();
    $("#settingsDialog").close();
    toast(`${medicines.length} medicines restored`);
  } catch (error) { console.error(error); alert(`Could not import this MediMap backup. ${error.message}.`); }
}

search.addEventListener("input", render);
$("#sortSelect").addEventListener("change", render);
$("#gridView").addEventListener("click", () => { viewMode = "grid"; localStorage.setItem("medimap-view", viewMode); render(); });
$("#listView").addEventListener("click", () => { viewMode = "list"; localStorage.setItem("medimap-view", viewMode); render(); });
$("#openOrganize").addEventListener("click", openOrganizer);
$("#sidebarAddMedicines").addEventListener("click", openDialog);
$("#sidebarShelfGuide").addEventListener("click", () => { const guide = $("#guide"); shelfGuideCollapsed = false; localStorage.setItem("medimap-shelf-guide-collapsed", "0"); renderShelfGuide(); setTimeout(() => { guide.scrollIntoView({ behavior: "smooth", block: "start" }); guide.classList.remove("guide-highlight"); requestAnimationFrame(() => guide.classList.add("guide-highlight")); }, window.innerWidth <= 900 ? 180 : 0); });
$("#toggleShelfGuide").addEventListener("click", () => { shelfGuideCollapsed = !shelfGuideCollapsed; localStorage.setItem("medimap-shelf-guide-collapsed", shelfGuideCollapsed ? "1" : "0"); renderShelfGuide(); });
$("#openShelfReference").addEventListener("click", () => $("#shelfReferenceDialog").showModal());
$("#closeShelfReference").addEventListener("click", () => $("#shelfReferenceDialog").close());
$("#doneShelfReference").addEventListener("click", () => $("#shelfReferenceDialog").close());
$("#closeMedicineSummary").addEventListener("click", () => $("#medicineSummaryDialog").close());
$("#doneMedicineSummary").addEventListener("click", () => $("#medicineSummaryDialog").close());
$("#editMedicine").addEventListener("click", openEditMedicine);
$("#closeEditMedicine").addEventListener("click", () => $("#editMedicineDialog").close());
$("#cancelEditMedicine").addEventListener("click", () => $("#editMedicineDialog").close());
$("#editMedicineGondola").addEventListener("input", () => { const location = locations.find((item) => item.gondola.toLowerCase() === $("#editMedicineGondola").value.trim().toLowerCase()); const shelves = location ? location.shelves : [...new Set(locations.flatMap((item) => item.shelves))]; $("#shelfList").innerHTML = shelves.sort().map((shelf) => `<option value="${escapeHtml(shelf)}"></option>`).join(""); });
$("#editMedicineForm").addEventListener("submit", (event) => { event.preventDefault(); const item = medicines.find((medicine) => medicine.id === editingMedicineId); if (!item) { $("#editMedicineDialog").close(); return; } const name = $("#editMedicineName").value.trim(); const gondola = $("#editMedicineGondola").value.trim(); const shelf = $("#editMedicineShelf").value.trim(); const expiryText = $("#editMedicineExpiry").value.trim(); const expiries = parseExpiryList(expiryText); if (expiryText && !expiries.length) { toast("Use expiry format MM/YYYY"); $("#editMedicineExpiry").focus(); return; } const category = $("#editMedicineCategory").value || "Uncategorized"; item.name = name; item.genericName = $("#editGenericName").value.trim(); item.category = category; item.gondola = gondola; item.shelf = shelf; item.expiries = expiries; item.expiry = expiries[0] || ""; addLocation(gondola, shelf); const placement = organizePlacements.get(item.id) || item.organizeSlot; if (placement) { item.organizeSlot = { ...placement, gondola, shelf }; organizePlacements.set(item.id, item.organizeSlot); } persist(); persistLocations(); persistOrganizerLayout(); $("#editMedicineDialog").close(); render(); toast("Medicine updated"); });
$("#sidebarToggle").addEventListener("click", () => { const sidebar = document.querySelector(".sidebar"); const open = sidebar.classList.toggle("mobile-open"); $("#sidebarToggle").setAttribute("aria-expanded", String(open)); $("#sidebarToggle").setAttribute("aria-label", open ? "Close navigation" : "Open navigation"); $("#sidebarToggle").innerHTML = sidebarToggleIcon(open); });
$("#mainNavigation").addEventListener("click", () => { if (window.innerWidth > 900) return; document.querySelector(".sidebar").classList.remove("mobile-open"); $("#sidebarToggle").setAttribute("aria-expanded", "false"); $("#sidebarToggle").setAttribute("aria-label", "Open navigation"); $("#sidebarToggle").innerHTML = sidebarToggleIcon(false); });
$("#openNearExpiry").addEventListener("click", openNearExpiryReport);
$("#closeNearExpiry").addEventListener("click", () => $("#nearExpiryDialog").close());
$("#doneNearExpiry").addEventListener("click", () => $("#nearExpiryDialog").close());
$("#nearExpiryMonth").addEventListener("change", renderNearExpiryReport);
$("#nearExpiryYear").addEventListener("change", renderNearExpiryReport);
$("#nearExpiryBody").addEventListener("click", (event) => { const button = event.target.closest("[data-update-stock]"); if (!button) return; const item = medicines.find((medicine) => medicine.id === Number(button.dataset.updateStock)); if (!item) return; const entered = prompt(`Enter the new stock expiry for ${item.name} (MM/YYYY):`); if (entered === null) return; const replacement = parseImportedExpiry(entered); if (!replacement) { toast("Use expiry format MM/YYYY"); return; } const expiries = getExpiries(item).filter((expiry) => expiry !== button.dataset.oldExpiry); expiries.push(replacement); item.expiries = [...new Set(expiries)].sort(); item.expiry = item.expiries[0] || ""; delete organizerDrafts[`expiry:${item.id}`]; persist(); persistOrganizerExtras(); render(); renderNearExpiryReport(); toast(`${item.name} stock expiry updated`); });
$("#closeOrganize").addEventListener("click", () => { persistOrganizerLayout(); persistOrganizerExtras(); $("#organizeDialog").close(); render(); });
$("#doneOrganize").addEventListener("click", () => { persistOrganizerLayout(); persistOrganizerExtras(); $("#organizeDialog").close(); render(); toast("Arrangement and expiry dates saved"); });
$("#exportOrganize").addEventListener("click", exportOrganizerArrangement);
$("#importOrganizeFile").addEventListener("change", async (event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) await importOrganizerArrangement(file); });
$("#organizeDialog").addEventListener("close", () => { persistOrganizerLayout(); persistOrganizerExtras(); render(); });
$("#organizeGondola").addEventListener("change", () => { localStorage.setItem("medimap-organizer-gondola", $("#organizeGondola").value); organizeActiveCell = null; organizerSelectedIds.clear(); renderOrganizer(); $("#exportOrganize").disabled = false; });
$("#selectAllOrganized").addEventListener("click", () => { const gondola = $("#organizeGondola").value; const arrangedIds = [...organizePlacements].filter(([, placement]) => placement.gondola === gondola).map(([id]) => id); const allSelected = arrangedIds.length && arrangedIds.every((id) => organizerSelectedIds.has(id)); organizerSelectedIds.clear(); if (!allSelected) arrangedIds.forEach((id) => organizerSelectedIds.add(id)); renderOrganizer(); });
$("#deleteOrganized").addEventListener("click", () => { const count = organizerSelectedIds.size; if (!count || !confirm(`Remove ${count} selected entr${count === 1 ? "y" : "ies"} from this arrangement? The medicines will remain in the main inventory.`)) return; const placementSnapshot = new Map(organizePlacements); const medicineSnapshot = medicines.map((medicine) => ({ ...medicine, expiries: [...(medicine.expiries || [])] })); organizerSelectedIds.forEach((id) => { organizePlacements.delete(id); const item = medicines.find((medicine) => medicine.id === id); if (item) delete item.organizeSlot; }); organizerSelectedIds.clear(); persist(); persistOrganizerLayout(); render(); renderOrganizer(); toast(`${count} arrangement entr${count === 1 ? "y" : "ies"} removed`, "Undo", () => { organizePlacements = placementSnapshot; medicines = medicineSnapshot; persist(); persistOrganizerLayout(); render(); renderOrganizer(); toast("Arrangement restored"); }, 6000); });
$("#organizeGrid").addEventListener("change", (event) => { const checkbox = event.target.closest("[data-select-organized]"); if (!checkbox) return; const id = Number(checkbox.dataset.selectOrganized); checkbox.checked ? organizerSelectedIds.add(id) : organizerSelectedIds.delete(id); renderOrganizer(); });
$("#organizeSearch").addEventListener("input", renderOrganizerMedicineList);
$("#organizeGrid").addEventListener("focusin", (event) => { const input = event.target.closest("[data-organize-input]"); if (!input) return; organizeActiveCell = { gondola: $("#organizeGondola").value, shelf: input.dataset.organizeInput, row: Number(input.dataset.organizeRow) }; $("#organizeGrid").querySelectorAll(".organize-entry").forEach((cell) => cell.classList.toggle("active", cell.contains(input))); updateOrganizerHint(); });
$("#organizeGrid").addEventListener("keydown", (event) => { const input = event.target.closest("[data-organize-input]"); const expiryInput = event.target.closest("[data-organize-expiry-id]"); if (event.key !== "Enter") return; if (input) { event.preventDefault(); const target = { gondola: $("#organizeGondola").value, shelf: input.dataset.organizeInput, row: Number(input.dataset.organizeRow) }; organizeActiveCell = target; placeMedicineInOrganizer(input.value); const item = medicineAtOrganizerCell(target.gondola, target.shelf, target.row); if (item) setTimeout(() => $(`[data-organize-expiry-id="${item.id}"]`)?.focus(), 0); } if (expiryInput) { event.preventDefault(); const item = medicines.find((medicine) => medicine.id === Number(expiryInput.dataset.organizeExpiryId)); const placement = item && organizePlacements.get(item.id); const expiries = parseExpiryList(expiryInput.value); if (!item || !placement || (expiryInput.value.trim() && !expiries.length)) { toast("Use expiry format MM/YYYY"); return; } item.expiries = expiries; item.expiry = expiries[0] || ""; persist(); render(); toast("Expiry saved"); setTimeout(() => [...document.querySelectorAll("[data-organize-input]")].find((field) => field.dataset.organizeInput === placement.shelf && Number(field.dataset.organizeRow) === placement.row + 1)?.focus(), 0); } });
$("#organizeGrid").addEventListener("change", (event) => { const newInput = event.target.closest("[data-organize-input]"); const expiryInput = event.target.closest("[data-organize-expiry-id]"); const nameInput = event.target.closest("[data-organize-name-id]"); if (newInput && newInput.value.trim()) { const target = { gondola: $("#organizeGondola").value, shelf: newInput.dataset.organizeInput, row: Number(newInput.dataset.organizeRow) }; organizeActiveCell = target; placeMedicineInOrganizer(newInput.value); const item = medicineAtOrganizerCell(target.gondola, target.shelf, target.row); if (item) setTimeout(() => $(`[data-organize-expiry-id="${item.id}"]`)?.focus(), 0); return; } if (expiryInput) { const item = medicines.find((medicine) => medicine.id === Number(expiryInput.dataset.organizeExpiryId)); if (!item) return; const expiries = parseExpiryList(expiryInput.value); if (expiryInput.value.trim() && !expiries.length) { toast("Use expiry format MM/YYYY"); expiryInput.focus(); return; } item.expiries = expiries; item.expiry = expiries[0] || ""; persist(); render(); toast("Expiry saved"); } if (nameInput) { const item = medicines.find((medicine) => medicine.id === Number(nameInput.dataset.organizeNameId)); const name = nameInput.value.trim(); if (!item || !name) { renderOrganizer(); return; } item.name = name; persist(); render(); toast("Medicine updated"); } });
$("#organizeGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-move-organizer]"); if (!button || button.disabled) return; const id = Number(button.dataset.medicineId); const placement = organizePlacements.get(id); if (!placement) return; const change = button.dataset.moveOrganizer === "up" ? -1 : 1; moveOrganizerMedicine(id, { ...placement, row: placement.row + change }); });
$("#organizeGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-add-organizer-row]"); if (!button) return; const gondola = $("#organizeGondola").value; const shelf = button.dataset.addOrganizerRow; const key = organizerShelfKey(gondola, shelf); organizerRowCounts[key] = Math.max(8, organizerRowCounts[key] || 8) + 1; persistOrganizerExtras(); renderOrganizer(); setTimeout(() => [...document.querySelectorAll("[data-organize-input]")].find((field) => field.dataset.organizeInput === shelf && Number(field.dataset.organizeRow) === organizerRowCounts[key] - 1)?.focus(), 0); });
$("#organizeGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-insert-organizer-row]"); if (!button) return; insertOrganizerRow($("#organizeGondola").value, button.dataset.insertOrganizerShelf, Number(button.dataset.insertOrganizerRow)); });
$("#organizeGrid").addEventListener("input", (event) => { const newInput = event.target.closest("[data-organize-input]"); const expiryInput = event.target.closest("[data-organize-expiry-id]"); const nameInput = event.target.closest("[data-organize-name-id]"); if (newInput) organizerDrafts[organizerDraftKey($("#organizeGondola").value, newInput.dataset.organizeInput, Number(newInput.dataset.organizeRow))] = newInput.value; if (expiryInput) { const id = Number(expiryInput.dataset.organizeExpiryId); organizerDrafts[`expiry:${id}`] = expiryInput.value; const item = medicines.find((medicine) => medicine.id === id); const expiries = parseExpiryList(expiryInput.value); if (item && (!expiryInput.value.trim() || expiries.length)) { item.expiries = expiries; item.expiry = expiries[0] || ""; persist(); } } if (nameInput) organizerDrafts[`name:${nameInput.dataset.organizeNameId}`] = nameInput.value; if (newInput || expiryInput || nameInput) persistOrganizerExtras(); });
$("#organizeGrid").addEventListener("dragstart", (event) => { const medicine = event.target.closest("[data-drag-medicine]"); if (!medicine) return; medicine.classList.add("dragging"); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", medicine.dataset.dragMedicine); });
$("#organizeGrid").addEventListener("dragover", (event) => { const cell = event.target.closest("[data-organize-cell]"); if (!cell) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; $("#organizeGrid").querySelectorAll(".drag-over").forEach((item) => item.classList.toggle("drag-over", item === cell)); });
$("#organizeGrid").addEventListener("dragleave", (event) => { const cell = event.target.closest("[data-organize-cell]"); if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove("drag-over"); });
$("#organizeGrid").addEventListener("drop", (event) => { const cell = event.target.closest("[data-organize-cell]"); if (!cell) return; event.preventDefault(); const id = Number(event.dataTransfer.getData("text/plain")); $("#organizeGrid").querySelectorAll(".drag-over").forEach((item) => item.classList.remove("drag-over")); moveOrganizerMedicine(id, { gondola: $("#organizeGondola").value, shelf: cell.dataset.organizeCell, row: Number(cell.dataset.organizeRow) }); });
$("#organizeGrid").addEventListener("dragend", () => { $("#organizeGrid").querySelectorAll(".dragging,.drag-over").forEach((item) => item.classList.remove("dragging", "drag-over")); });
$("#organizeMedicineList").addEventListener("click", (event) => { const button = event.target.closest("[data-organize-medicine]"); if (button) placeMedicineInOrganizer("", Number(button.dataset.organizeMedicine)); });
$("#openSettings").addEventListener("click", () => { updateSettingsSummary(); $("#settingsDialog").showModal(); });
$("#closeSettings").addEventListener("click", () => $("#settingsDialog").close());
$("#doneSettings").addEventListener("click", () => $("#settingsDialog").close());
$("#settingsCustomName").addEventListener("input", () => { customPharmacyName = $("#settingsCustomName").value.slice(0, 60); localStorage.setItem("medimap-custom-name", customPharmacyName); renderCustomPharmacyName(); });
$("#clearCustomName").addEventListener("click", () => { customPharmacyName = ""; $("#settingsCustomName").value = ""; localStorage.removeItem("medimap-custom-name"); renderCustomPharmacyName(); toast("Custom name cleared"); });
$("#exportAppData").addEventListener("click", exportMediMapData);
$("#settingsView").addEventListener("change", () => { viewMode = $("#settingsView").value; localStorage.setItem("medimap-view", viewMode); render(); });
$("#formatData").addEventListener("click", () => { const confirmation = prompt("This permanently erases all MediMap pharmacy data on this device. Type FORMAT to continue."); if (confirmation !== "FORMAT") { if (confirmation !== null) toast("Format cancelled — text did not match"); return; } medicines = []; locations = []; categoryChoices = ["Uncategorized"]; organizePlacements = new Map(); organizerRowCounts = {}; organizerDrafts = {}; customPharmacyName = ""; selectedIds.clear(); activeCategory = "All"; viewMode = "grid"; search.value = ""; localStorage.setItem("medicine-finder-inventory", JSON.stringify(medicines)); localStorage.setItem("medimap-locations", JSON.stringify(locations)); localStorage.setItem("medimap-categories", JSON.stringify(categoryChoices)); localStorage.setItem("medimap-organizer-layout", "[]"); localStorage.setItem("medimap-organizer-row-counts", "{}"); localStorage.setItem("medimap-organizer-drafts", "{}"); localStorage.removeItem("medimap-custom-name"); localStorage.setItem("medimap-category-presets-removed", "1"); localStorage.setItem("medimap-view", viewMode); renderCustomPharmacyName(); $("#settingsDialog").close(); render(); toast("MediMap data formatted"); });
$("#boxSelect").addEventListener("click", () => { boxSelectMode = !boxSelectMode; $("#boxSelect").classList.toggle("active", boxSelectMode); $("#selectionSurface").classList.toggle("box-select-active", boxSelectMode); toast(boxSelectMode ? "Drag a box across medicines to select them" : "Box selection turned off"); });
$("#toggleCategories").addEventListener("click", () => { categoriesExpanded = !categoriesExpanded; renderFilters(); });
$("#categoryFilters").addEventListener("click", (event) => { if (event.target.dataset.category) { activeCategory = event.target.dataset.category; if (window.innerWidth <= 760) categoriesExpanded = false; render(); } });
$("#manageCategories").addEventListener("click", () => { renderCategoryEditor(); $("#categoryDialog").showModal(); setTimeout(() => $("#newCategory").focus(), 50); });
$("#openCategoryGuide").addEventListener("click", () => { $("#categoryGuideSearch").value = ""; renderCategoryGuide(); $("#categoryGuideDialog").showModal(); setTimeout(() => $("#categoryGuideSearch").focus(), 50); });
$("#closeCategoryGuide").addEventListener("click", () => $("#categoryGuideDialog").close());
$("#doneCategoryGuide").addEventListener("click", () => $("#categoryGuideDialog").close());
$("#categoryGuideSearch").addEventListener("input", renderCategoryGuide);
$("#closeCategories").addEventListener("click", () => $("#categoryDialog").close());
$("#doneCategories").addEventListener("click", () => $("#categoryDialog").close());
$("#categoryForm").addEventListener("submit", (event) => { event.preventDefault(); const name = $("#newCategory").value.trim(); if (!name) return; if (categoryChoices.some((item) => item.toLowerCase() === name.toLowerCase())) { toast("That category already exists"); return; } categoryChoices.push(name); persistCategories(); $("#newCategory").value = ""; render(); renderCategoryEditor(); toast(`${name} added`); });
$("#categoryEditorList").addEventListener("click", (event) => {
  const saveIndex = event.target.dataset.saveCategory; const removeIndex = event.target.dataset.removeCategory;
  if (saveIndex !== undefined) { const index = Number(saveIndex); const oldName = categoryChoices[index]; const input = $(`[data-category-index="${index}"]`); const description = $(`[data-category-description="${index}"]`).value.trim(); const newName = input.value.trim(); if (!newName || (newName.toLowerCase() !== oldName.toLowerCase() && categoryChoices.some((item) => item.toLowerCase() === newName.toLowerCase()))) { toast("Enter a unique category name"); return; } categoryChoices[index] = newName; medicines = medicines.map((item) => item.category === oldName ? { ...item, category: newName } : item); if (oldName !== newName) delete categoryDescriptions[oldName]; if (description) categoryDescriptions[newName] = description; else delete categoryDescriptions[newName]; if (activeCategory === oldName) activeCategory = newName; persistCategories(); persistCategoryDescriptions(); persist(); render(); renderCategoryEditor(); toast("Category details saved"); }
  if (removeIndex !== undefined) { const index = Number(removeIndex); const name = categoryChoices[index]; if (name === "Uncategorized" || !confirm(`Remove ${name}? Medicines using it will become Uncategorized.`)) return; const categorySnapshot = [...categoryChoices]; const descriptionSnapshot = { ...categoryDescriptions }; const medicineSnapshot = medicines.map((medicine) => ({ ...medicine, expiries: [...(medicine.expiries || [])] })); categoryChoices.splice(index, 1); delete categoryDescriptions[name]; medicines = medicines.map((item) => item.category === name ? { ...item, category: "Uncategorized" } : item); if (activeCategory === name) activeCategory = "All"; persistCategories(); persistCategoryDescriptions(); persist(); render(); renderCategoryEditor(); toast("Category removed", "Undo", () => { categoryChoices = categorySnapshot; categoryDescriptions = descriptionSnapshot; medicines = medicineSnapshot; persistCategories(); persistCategoryDescriptions(); persist(); render(); renderCategoryEditor(); toast("Category restored"); }, 6000); }
});
$("#clearSearch").addEventListener("click", () => { search.value = ""; activeCategory = "All"; activeGondola = ""; activeExpiryFilter = ""; render(); search.focus(); });
$("#mobileGondolaFilter").addEventListener("change", (event) => { activeGondola = event.target.value; render(); });
$("#mobileExpiryFilter").addEventListener("change", (event) => { activeExpiryFilter = event.target.value; render(); });
$("#activeFilterChips").addEventListener("click", (event) => { const button = event.target.closest("[data-clear-filter]"); if (!button) return; if (button.dataset.clearFilter === "category") activeCategory = "All"; if (button.dataset.clearFilter === "gondola") activeGondola = ""; if (button.dataset.clearFilter === "expiry") activeExpiryFilter = ""; if (button.dataset.clearFilter === "search") search.value = ""; render(); });
$("#mobileSelectMode").addEventListener("click", () => { selectionMode = !selectionMode; if (!selectionMode) selectedIds.clear(); updateSelectionBar(); toast(selectionMode ? "Tap medicines to select them" : "Selection mode closed"); });
$("#openAdd").addEventListener("click", openDialog);
$("#excelFile").addEventListener("change", async (event) => { const file = event.target.files[0]; if (file) { showImportSkeleton(); await new Promise((resolve) => requestAnimationFrame(resolve)); try { if (file.name.toLowerCase().endsWith(".json")) await importMediMapData(file); else await importExcelWorkbook(file); } finally { grid.classList.remove("import-loading"); render(); } } event.target.value = ""; });
document.addEventListener("click", (event) => { if (event.target.closest("[data-open-add]")) openDialog(); });
$("#cancelAdd").addEventListener("click", closeDialog);
$("#bulkNames").addEventListener("input", updateLineCount);
$("#categoryInput").addEventListener("change", () => { const isNew = $("#categoryInput").value === "__new__"; $("#inlineCategoryField").hidden = !isNew; if (isNew) setTimeout(() => $("#inlineNewCategory").focus(), 30); else $("#inlineNewCategory").value = ""; });
$("#gondolaInput").addEventListener("input", renderLocationLists);
$("#manageGondolas").addEventListener("click", () => { renderGondolaManager(); $("#gondolaDialog").showModal(); setTimeout(() => $("#newGondola").focus(), 50); });
$("#closeGondolas").addEventListener("click", () => $("#gondolaDialog").close());
$("#gondolaForm").addEventListener("submit", (event) => { event.preventDefault(); const gondola = $("#newGondola").value.trim(); const shelves = $("#newShelves").value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean); shelves.forEach((shelf) => addLocation(gondola, shelf)); persistLocations(); event.target.reset(); render(); renderGondolaManager(); toast(`${gondola} added with ${shelves.length} shelf${shelves.length === 1 ? "" : "ves"}`); });
$("#shelfGuide").addEventListener("click", (event) => { const button = event.target.closest("[data-expiry-gondola]"); if (button) openExpiryDialog(button.dataset.expiryGondola, button.dataset.expiryShelf); });
$("#expiryList").addEventListener("input", updateExpiryProgress);
$("#closeExpiry").addEventListener("click", closeExpiryDialog);
$("#cancelExpiry").addEventListener("click", closeExpiryDialog);
$("#expiryForm").addEventListener("submit", (event) => { event.preventDefault(); const gondola = activeExpiryLocation?.gondola || "location"; const values = new Map([...document.querySelectorAll("[data-expiry-id]")].map((input) => [Number(input.dataset.expiryId), parseExpiryList(input.value)])); medicines = medicines.map((item) => { if (!values.has(item.id)) return item; const expiries = values.get(item.id); return { ...item, expiries, expiry: expiries[0] || "" }; }); persist(); closeExpiryDialog(); render(); toast(`Expiry dates saved for ${gondola}`); });
grid.addEventListener("change", (event) => { const id = Number(event.target.dataset.select); if (!id) return; event.target.checked ? selectedIds.add(id) : selectedIds.delete(id); render(); });
grid.addEventListener("click", (event) => { const id = Number(event.target.dataset.delete); if (!id) return; const item = medicines.find((med) => med.id === id); if (item && confirm(`Remove ${item.name} from the catalog?`)) { const snapshot = medicines.map((medicine) => ({ ...medicine, expiries: [...(medicine.expiries || [])] })); medicines = medicines.filter((med) => med.id !== id); selectedIds.delete(id); persist(); render(); toast("Medicine removed", "Undo", () => { medicines = snapshot; persist(); render(); toast("Medicine restored"); }, 6000); } });
grid.addEventListener("click", (event) => { const button = event.target.closest("[data-card-menu]"); if (!button) return; const id = button.dataset.cardMenu; const menu = grid.querySelector(`[data-card-actions="${id}"]`); const opening = menu.hidden; grid.querySelectorAll("[data-card-actions]").forEach((item) => { item.hidden = true; }); grid.querySelectorAll("[data-card-menu]").forEach((item) => item.setAttribute("aria-expanded", "false")); menu.hidden = !opening; button.setAttribute("aria-expanded", String(opening)); });
grid.addEventListener("click", (event) => { const button = event.target.closest("[data-details]"); if (!button) return; openMedicineSummary(medicines.find((item) => item.id === Number(button.dataset.details))); });
grid.addEventListener("click", (event) => { const button = event.target.closest("[data-edit-medicine]"); if (!button) return; editingMedicineId = Number(button.dataset.editMedicine); openEditMedicine(); });
grid.addEventListener("click", (event) => { if (swipeJustHappened) { swipeJustHappened = false; return; } if (boxSelectMode || event.target.closest("button,input,label,a")) return; const card = event.target.closest("[data-card-id]"); if (!card) return; if (selectionMode) { const id = Number(card.dataset.cardId); selectedIds.has(id) ? selectedIds.delete(id) : selectedIds.add(id); render(); return; } openMedicineSummary(medicines.find((item) => item.id === Number(card.dataset.cardId))); });
$("#selectAll").addEventListener("click", () => { if (medicines.length && selectedIds.size === medicines.length) selectedIds.clear(); else medicines.forEach((item) => selectedIds.add(item.id)); render(); });
$("#clearSelection").addEventListener("click", () => { selectedIds.clear(); selectionMode = false; render(); });
$("#bulkCategory").addEventListener("change", () => { const isNew = $("#bulkCategory").value === "__new__"; $("#bulkNewCategory").hidden = !isNew; if (isNew) setTimeout(() => $("#bulkNewCategory").focus(), 30); else $("#bulkNewCategory").value = ""; });
$("#assignCategory").addEventListener("click", () => { const selectedValue = $("#bulkCategory").value.trim(); if (!selectedValue) { $("#bulkCategory").focus(); return; } const typedCategory = selectedValue === "__new__" ? $("#bulkNewCategory").value.trim() : ""; if (selectedValue === "__new__" && !typedCategory) { $("#bulkNewCategory").focus(); return; } const existingCategory = categoryChoices.find((item) => item.toLowerCase() === typedCategory.toLowerCase()); const category = typedCategory ? (existingCategory || typedCategory) : selectedValue; if (typedCategory && !existingCategory) { categoryChoices.push(typedCategory); persistCategories(); } const count = selectedIds.size; medicines = medicines.map((item) => selectedIds.has(item.id) ? { ...item, category } : item); persist(); selectedIds.clear(); activeCategory = "All"; $("#bulkCategory").value = ""; $("#bulkNewCategory").value = ""; $("#bulkNewCategory").hidden = true; render(); toast(`Category assigned to ${count} medicine${count === 1 ? "" : "s"}`); });
$("#moveGondola").addEventListener("click", () => { const gondola = $("#bulkGondola").value.trim(); if (!gondola) { $("#bulkGondola").focus(); return; } const count = selectedIds.size; medicines.forEach((item) => { if (selectedIds.has(item.id)) addLocation(gondola, item.shelf); }); medicines = medicines.map((item) => selectedIds.has(item.id) ? { ...item, gondola } : item); persist(); persistLocations(); selectedIds.clear(); $("#bulkGondola").value = ""; render(); toast(`${count} medicine${count === 1 ? "" : "s"} moved to ${gondola}`); });
$("#deleteSelected").addEventListener("click", () => { const count = selectedIds.size; if (!count || !confirm(`Delete ${count} selected medicine${count === 1 ? "" : "s"}?`)) return; const snapshot = medicines.map((medicine) => ({ ...medicine, expiries: [...(medicine.expiries || [])] })); medicines = medicines.filter((item) => !selectedIds.has(item.id)); selectedIds.clear(); selectionMode = false; persist(); render(); toast(`${count} medicine${count === 1 ? "" : "s"} deleted`, "Undo", () => { medicines = snapshot; persist(); render(); toast(`${count} medicine${count === 1 ? "" : "s"} restored`); }, 6000); });
$("#medicineForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const names = $("#bulkNames").value.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
  if (!names.length) return;
  const typedCategory = $("#inlineCategoryField").hidden ? "" : $("#inlineNewCategory").value.trim();
  if (!$("#inlineCategoryField").hidden && !typedCategory) { $("#inlineNewCategory").focus(); return; }
  const existingCategory = categoryChoices.find((item) => item.toLowerCase() === typedCategory.toLowerCase());
  const category = typedCategory ? (existingCategory || typedCategory) : $("#categoryInput").value.trim() || "Uncategorized";
  if (typedCategory && !existingCategory) { categoryChoices.push(typedCategory); persistCategories(); }
  const now = Date.now();
  addLocation($("#gondolaInput").value.trim(), $("#shelfInput").value.trim()); persistLocations();
  names.forEach((name, index) => medicines.push({ id: now + index, name, category, gondola: $("#gondolaInput").value.trim(), shelf: $("#shelfInput").value.trim(), expiry: "", expiries: [], addedAt: now + index }));
  consolidateMedicineBatches();
  persist(); closeDialog(); activeCategory = "All"; search.value = ""; render(); toast(`${names.length} medicine${names.length === 1 ? "" : "s"} added`);
});

let dragSelection = null;
$("#selectionSurface").addEventListener("pointerdown", (event) => { if (!boxSelectMode || event.button !== 0 || event.target.closest("button,input,label,select")) return; event.preventDefault(); dragSelection = { startX: event.clientX, startY: event.clientY, base: new Set(selectedIds) }; $("#selectionBox").hidden = false; });
document.addEventListener("pointermove", (event) => { if (!dragSelection) return; event.preventDefault(); const left = Math.min(dragSelection.startX, event.clientX); const top = Math.min(dragSelection.startY, event.clientY); const right = Math.max(dragSelection.startX, event.clientX); const bottom = Math.max(dragSelection.startY, event.clientY); const surfaceRect = $("#selectionSurface").getBoundingClientRect(); const box = $("#selectionBox"); Object.assign(box.style, { left: `${left - surfaceRect.left}px`, top: `${top - surfaceRect.top}px`, width: `${right - left}px`, height: `${bottom - top}px` }); selectedIds.clear(); dragSelection.base.forEach((id) => selectedIds.add(id)); grid.querySelectorAll("[data-card-id]").forEach((card) => { const rect = card.getBoundingClientRect(); const hit = rect.left < right && rect.right > left && rect.top < bottom && rect.bottom > top; const id = Number(card.dataset.cardId); if (hit) selectedIds.add(id); card.classList.toggle("selected", selectedIds.has(id)); const checkbox = card.querySelector("[data-select]"); if (checkbox) checkbox.checked = selectedIds.has(id); }); updateSelectionBar(); });
document.addEventListener("pointerup", () => { if (!dragSelection) return; dragSelection = null; $("#selectionBox").hidden = true; $("#selectionBox").removeAttribute("style"); render(); });
grid.addEventListener("pointerdown", (event) => { if (window.innerWidth > 900 || selectionMode || event.target.closest("button,input,label")) return; const card = event.target.closest("[data-card-id]"); if (card) cardSwipe = { card, x: event.clientX, y: event.clientY }; });
grid.addEventListener("pointerup", (event) => { if (!cardSwipe) return; const { card, x, y } = cardSwipe; cardSwipe = null; const dx = event.clientX - x; const dy = event.clientY - y; if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.25) return; swipeJustHappened = true; grid.querySelectorAll(".medicine-card.swiped").forEach((item) => { if (item !== card) { item.classList.remove("swiped"); item.querySelector("[data-card-actions]").hidden = true; } }); const reveal = dx < 0; card.classList.toggle("swiped", reveal); const menu = card.querySelector("[data-card-actions]"); menu.hidden = !reveal; setTimeout(() => { swipeJustHappened = false; }, 350); });
grid.addEventListener("pointercancel", () => { cardSwipe = null; swipeJustHappened = false; });
document.addEventListener("dblclick", (event) => { if (window.innerWidth <= 900 && event.target.closest("button,a,label,.medicine-card,.mobile-tabbar,.mobile-more-sheet")) event.preventDefault(); }, { passive: false });
$("#toastAction").addEventListener("click", () => { const action = undoOperation; undoOperation = null; $("#toastAction").hidden = true; if (action) action(); });

document.addEventListener("click", (event) => { if (event.target.closest("#openAdd,#sidebarAddMedicines,#openOrganize,#openNearExpiry,#openSettings,#manageCategories,#manageGondolas,#openCategoryGuide,#openShelfReference,[data-card-id],[data-mobile-action]")) preservedScrollY = window.scrollY; }, true);
document.querySelectorAll("dialog").forEach((dialog) => dialog.addEventListener("close", () => requestAnimationFrame(() => window.scrollTo({ top: preservedScrollY, behavior: "auto" }))));

document.querySelectorAll("dialog").forEach((dialog) => {
  let sheetDrag = null;
  dialog.addEventListener("pointerdown", (event) => { if (window.innerWidth > 900 || event.target.closest("button,input,select,textarea,a") || !event.target.closest(".dialog-head")) return; sheetDrag = { y: event.clientY, time: performance.now() }; dialog.setPointerCapture?.(event.pointerId); });
  dialog.addEventListener("pointermove", (event) => { if (!sheetDrag) return; const distance = Math.max(0, event.clientY - sheetDrag.y); dialog.style.transform = `translateY(${Math.min(distance, 180)}px)`; dialog.style.transition = "none"; });
  dialog.addEventListener("pointerup", (event) => { if (!sheetDrag) return; const distance = event.clientY - sheetDrag.y; const quick = performance.now() - sheetDrag.time < 300 && distance > 55; sheetDrag = null; dialog.style.transition = ""; dialog.style.transform = ""; if (distance > 95 || quick) dialog.close(); });
});

let navScrollFrame = 0;
window.addEventListener("scroll", () => { if (window.innerWidth > 900 || navScrollFrame || $("#mobileMoreSheet")?.hidden === false || document.querySelector("dialog[open]")) return; navScrollFrame = requestAnimationFrame(() => { navScrollFrame = 0; const guideTop = $("#guide").getBoundingClientRect().top; setMobileTab(guideTop < window.innerHeight * .62 ? "shelves" : "inventory"); }); }, { passive: true });
window.addEventListener("beforeunload", () => { persist(); persistOrganizerLayout(); persistOrganizerExtras(); });

function closeMobileMore() { const sheet = $("#mobileMoreSheet"); sheet.hidden = true; document.body.classList.remove("mobile-sheet-open"); const guideTop = $("#guide")?.getBoundingClientRect().top ?? Infinity; setMobileTab(guideTop < window.innerHeight * .62 ? "shelves" : "inventory"); }
function setMobileTab(destination) { document.querySelectorAll("[data-mobile-destination]").forEach((button) => { const active = button.dataset.mobileDestination === destination; button.classList.toggle("active", active); if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current"); }); }
document.querySelector(".mobile-tabbar")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mobile-destination]"); if (!button) return;
  const destination = button.dataset.mobileDestination;
  if (destination === "inventory") { closeMobileMore(); setMobileTab("inventory"); $("#inventory").scrollIntoView({ behavior: "smooth", block: "start" }); search.focus({ preventScroll: true }); }
  if (destination === "shelves") { closeMobileMore(); setMobileTab("shelves"); shelfGuideCollapsed = false; localStorage.setItem("medimap-shelf-guide-collapsed", "0"); renderShelfGuide(); $("#guide").scrollIntoView({ behavior: "smooth", block: "center" }); }
  if (destination === "organize") { closeMobileMore(); setMobileTab("organize"); $("#openOrganize").click(); }
  if (destination === "more") { setMobileTab("more"); $("#mobileMoreSheet").hidden = false; document.body.classList.add("mobile-sheet-open"); }
});
document.querySelectorAll("[data-close-mobile-more]").forEach((button) => button.addEventListener("click", closeMobileMore));
{
  const panel = document.querySelector(".mobile-sheet-panel"); let moreDrag = null;
  panel?.addEventListener("pointerdown", (event) => { if (event.target.closest("button,input,select,a") || event.clientY > panel.getBoundingClientRect().top + 48) return; moreDrag = { y: event.clientY, time: performance.now() }; });
  panel?.addEventListener("pointermove", (event) => { if (!moreDrag) return; const distance = Math.max(0, event.clientY - moreDrag.y); panel.style.transform = `translateY(${Math.min(distance, 220)}px)`; panel.style.transition = "none"; });
  panel?.addEventListener("pointerup", (event) => { if (!moreDrag) return; const distance = event.clientY - moreDrag.y; const quick = performance.now() - moreDrag.time < 300 && distance > 55; moreDrag = null; panel.style.transform = ""; panel.style.transition = ""; if (distance > 95 || quick) closeMobileMore(); });
}
$("#mobileMoreSheet")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mobile-action]"); if (!button) return;
  const targets = { add: "#openAdd", expiry: "#openNearExpiry", categories: "#manageCategories", gondolas: "#manageGondolas", settings: "#openSettings" };
  closeMobileMore(); document.querySelector(targets[button.dataset.mobileAction])?.click();
});
document.addEventListener("click", (event) => { if (!event.target.closest(".medicine-card")) { grid.querySelectorAll("[data-card-actions]").forEach((menu) => { menu.hidden = true; }); grid.querySelectorAll("[data-card-menu]").forEach((button) => button.setAttribute("aria-expanded", "false")); } });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !$("#mobileMoreSheet").hidden) closeMobileMore(); });

renderCustomPharmacyName();
renderAppVersion();
render();

let deferredInstallPrompt = null;
const installControls = [...document.querySelectorAll("[data-install-app]")];
function setInstallControlsVisible(visible) { installControls.forEach((control) => { control.hidden = !visible; }); }
window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; setInstallControlsVisible(true); });
window.addEventListener("appinstalled", () => { deferredInstallPrompt = null; setInstallControlsVisible(false); toast("MediMap installed successfully"); });
installControls.forEach((control) => control.addEventListener("click", async () => {
  closeMobileMore();
  if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); const result = await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; setInstallControlsVisible(false); if (result.outcome === "accepted") toast("Installing MediMap…"); return; }
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(isIOS ? "In Safari, tap Share then Add to Home Screen" : "Use your browser menu and choose Install app", "Got it", () => {}, 6000);
}));
if (!window.matchMedia("(display-mode: standalone)").matches && /iphone|ipad|ipod/i.test(navigator.userAgent)) setInstallControlsVisible(true);

const launchAction = new URLSearchParams(location.search).get("action");
if (launchAction === "add") setTimeout(openDialog, 250);
if (launchAction === "expiry") setTimeout(openNearExpiryReport, 250);

if ("serviceWorker" in navigator) window.addEventListener("load", async () => {
  try {
    const registration = await navigator.serviceWorker.register("service-worker.js");
    const offerUpdate = (worker) => { if (!worker) return; toast("A MediMap update is ready", "Update", () => worker.postMessage("SKIP_WAITING"), 10000); };
    if (registration.waiting) offerUpdate(registration.waiting);
    registration.addEventListener("updatefound", () => { const worker = registration.installing; worker?.addEventListener("statechange", () => { if (worker.state === "installed" && navigator.serviceWorker.controller) offerUpdate(worker); }); });
    let refreshing = false; navigator.serviceWorker.addEventListener("controllerchange", () => { if (refreshing) return; refreshing = true; location.reload(); });
  } catch (error) { console.error("MediMap could not enable offline mode", error); }
});
