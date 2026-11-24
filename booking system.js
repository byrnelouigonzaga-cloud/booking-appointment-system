/* ------------------------------------------------------------
   Appointments - app logic (plain JavaScript, no libraries)

   CRUD:
     Create  -> saveBooking() when no id is set
     Read    -> renderList()
     Update  -> startEdit() then saveBooking() with an id
     Delete  -> deleteBooking()

   Data is kept in the browser (localStorage). To use a real
   database later, replace loadBookings() and storeBookings().
------------------------------------------------------------ */


/* ===== 1. SETTINGS - edit these ===== */

// What can be booked. Add or remove lines freely.
var SERVICES = [
  { name: "Consultation", minutes: 30 },
  { name: "Standard appointment", minutes: 60 },
  { name: "Extended session", minutes: 90 }
];

var OPEN_HOUR = 9;          // opens at 9:00
var CLOSE_HOUR = 17;        // last appointment must end by 17:00
var SLOT_STEP = 30;         // start times every 30 minutes
var CLOSED_DAYS = [0];      // 0 = Sunday, 6 = Saturday

var STORAGE_KEY = "bookings";


/* ===== 2. DATA (storage) ===== */

function loadBookings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function storeBookings(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

var bookings = loadBookings();


/* ===== 3. PAGE ELEMENTS ===== */

var form = document.getElementById("booking-form");
var formTitle = document.getElementById("form-title");
var idField = document.getElementById("booking-id");
var serviceField = document.getElementById("service");
var dateField = document.getElementById("date");
var timeField = document.getElementById("time");
var timeHint = document.getElementById("time-hint");
var nameField = document.getElementById("name");
var emailField = document.getElementById("email");
var phoneField = document.getElementById("phone");
var notesField = document.getElementById("notes");
var messageBox = document.getElementById("message");
var saveBtn = document.getElementById("save-btn");
var cancelBtn = document.getElementById("cancel-btn");
var listEl = document.getElementById("booking-list");
var emptyEl = document.getElementById("empty");
var searchField = document.getElementById("search");


/* ===== 4. SMALL HELPERS ===== */

// Turns "09:30" into minutes since midnight (570)
function toMinutes(time) {
  var parts = time.split(":");
  return Number(parts[0]) * 60 + Number(parts[1]);
}

// Turns 570 into "09:30"
function toTime(minutes) {
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  return pad(h) + ":" + pad(m);
}

function pad(n) {
  return n < 10 ? "0" + n : String(n);
}

// "13:30" -> "1:30 PM"
function showTime(time) {
  var minutes = toMinutes(time);
  var h = Math.floor(minutes / 60);
  var m = minutes % 60;
  var ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) { h = 12; }
  return h + ":" + pad(m) + " " + ampm;
}

// "2026-11-24" -> "Tue, Nov 24"
function showDate(date) {
  var d = new Date(date + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function todayString() {
  var d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

function nowMinutes() {
  var d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

function findService(name) {
  for (var i = 0; i < SERVICES.length; i++) {
    if (SERVICES[i].name === name) { return SERVICES[i]; }
  }
  return SERVICES[0];
}

// Makes text safe to put inside HTML
function esc(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(text, ok) {
  messageBox.textContent = text;
  messageBox.className = ok ? "message ok" : "message";
}


/* ===== 5. AVAILABLE TIME SLOTS ===== */

// Is this date a day the business is closed?
function isClosed(date) {
  var day = new Date(date + "T00:00:00").getDay();
  return CLOSED_DAYS.indexOf(day) !== -1;
}

// Does a new booking (start, end in minutes) overlap an existing one?
// ignoreId lets us skip the booking we are currently editing.
function hasConflict(date, start, end, ignoreId) {
  for (var i = 0; i < bookings.length; i++) {
    var b = bookings[i];
    if (b.id === ignoreId || b.date !== date) { continue; }
    var bStart = toMinutes(b.time);
    var bEnd = bStart + findService(b.service).minutes;
    if (start < bEnd && end > bStart) { return true; }
  }
  return false;
}

// Returns a list of free start times like ["09:00", "09:30", ...]
function getFreeSlots(date, serviceName, ignoreId) {
  var slots = [];
  if (!date || isClosed(date)) { return slots; }

  var length = findService(serviceName).minutes;
  var isToday = date === todayString();

  for (var start = OPEN_HOUR * 60; start + length <= CLOSE_HOUR * 60; start += SLOT_STEP) {
    if (isToday && start <= nowMinutes()) { continue; }
    if (hasConflict(date, start, start + length, ignoreId)) { continue; }
    slots.push(toTime(start));
  }
  return slots;
}

// Fills the Time dropdown. keepTime keeps the current time selected while editing.
function updateTimes(keepTime) {
  var date = dateField.value;
  var slots = getFreeSlots(date, serviceField.value, idField.value);

  // While editing, make sure the original time stays in the list
  if (keepTime && slots.indexOf(keepTime) === -1) { slots.push(keepTime); slots.sort(); }

  timeField.innerHTML = "";

  if (!date) {
    timeHint.textContent = "Choose a date to see open times.";
    return;
  }
  if (isClosed(date)) {
    timeHint.textContent = "Closed on this day. Please pick another date.";
    return;
  }
  if (slots.length === 0) {
    timeHint.textContent = "No open times left on this date.";
    return;
  }

  for (var i = 0; i < slots.length; i++) {
    var option = document.createElement("option");
    option.value = slots[i];
    option.textContent = showTime(slots[i]);
    timeField.appendChild(option);
  }
  if (keepTime) { timeField.value = keepTime; }
  timeHint.textContent = slots.length + " open time" + (slots.length === 1 ? "" : "s") + ".";
}


/* ===== 6. CREATE + UPDATE ===== */

function saveBooking(event) {
  event.preventDefault();

  var id = idField.value;
  var name = nameField.value.trim();
  var email = emailField.value.trim();
  var phone = phoneField.value.trim();

  // Checks
  if (!dateField.value) { return showMessage("Please choose a date."); }
  if (!timeField.value) { return showMessage("Please choose a time."); }
  if (!name) { return showMessage("Please enter a name."); }
  if (!email && !phone) { return showMessage("Please enter an email or a phone number."); }
  if (email && email.indexOf("@") === -1) { return showMessage("That email does not look right."); }

  // Last check for double booking
  var start = toMinutes(timeField.value);
  var end = start + findService(serviceField.value).minutes;
  if (hasConflict(dateField.value, start, end, id)) {
    updateTimes();
    return showMessage("That time was just taken. Please pick another.");
  }

  var data = {
    service: serviceField.value,
    date: dateField.value,
    time: timeField.value,
    name: name,
    email: email,
    phone: phone,
    notes: notesField.value.trim()
  };

  if (id) {
    // UPDATE: find the booking and replace its fields
    for (var i = 0; i < bookings.length; i++) {
      if (bookings[i].id === id) {
        data.id = id;
        bookings[i] = data;
      }
    }
  } else {
    // CREATE: add a new booking with a new id
    data.id = String(Date.now());
    bookings.push(data);
  }

  storeBookings(bookings);
  var wasEdit = Boolean(id);
  resetForm();
  renderList();
  showMessage(wasEdit ? "Booking updated." : "Booking saved.", true);
}


/* ===== 7. READ (show the list) ===== */

function renderList() {
  var search = searchField.value.trim().toLowerCase();
  var today = todayString();
  var nowMin = nowMinutes();

  // Sort by date, then time
  var sorted = bookings.slice().sort(function (a, b) {
    return (a.date + a.time).localeCompare(b.date + b.time);
  });

  listEl.innerHTML = "";
  var shown = 0;

  for (var i = 0; i < sorted.length; i++) {
    var b = sorted[i];

    // Search filter
    var text = (b.name + " " + b.service + " " + b.email + " " + b.phone).toLowerCase();
    if (search && text.indexOf(search) === -1) { continue; }

    var isPast = b.date < today || (b.date === today && toMinutes(b.time) < nowMin);
    var endTime = toTime(toMinutes(b.time) + findService(b.service).minutes);

    var li = document.createElement("li");
    li.className = "item" + (isPast ? " past" : "");
    li.innerHTML =
      '<div class="when">' + esc(showDate(b.date)) +
        '<small>' + esc(showTime(b.time)) + ' to ' + esc(showTime(endTime)) + '</small></div>' +
      '<div class="who">' +
        '<strong>' + esc(b.name) + '</strong>' +
        '<span><span class="tag' + (isPast ? ' past' : '') + '">' +
          esc(isPast ? "Past" : b.service) + '</span>' +
          (isPast ? esc(b.service) : "") + '</span>' +
        (b.email ? '<span>' + esc(b.email) + '</span>' : '') +
        (b.phone ? '<span>' + esc(b.phone) + '</span>' : '') +
        (b.notes ? '<span>' + esc(b.notes) + '</span>' : '') +
      '</div>' +
      '<div class="item-actions">' +
        '<button type="button" class="btn-text" data-edit="' + b.id + '">Edit</button>' +
        '<button type="button" class="btn-text danger" data-delete="' + b.id + '">Delete</button>' +
      '</div>';

    // Slight stagger when the list appears
    li.style.animationDelay = (shown * 40) + "ms";
    listEl.appendChild(li);
    shown++;
  }

  emptyEl.hidden = shown > 0;
  emptyEl.textContent = bookings.length === 0
    ? "No bookings yet. Add the first one on the left."
    : "No bookings match your search.";
}

// One click listener handles every Edit and Delete button
listEl.addEventListener("click", function (event) {
  var editId = event.target.getAttribute("data-edit");
  var deleteId = event.target.getAttribute("data-delete");
  if (editId) { startEdit(editId); }
  if (deleteId) { deleteBooking(deleteId); }
});


/* ===== 8. UPDATE (load a booking into the form) ===== */

function startEdit(id) {
  for (var i = 0; i < bookings.length; i++) {
    if (bookings[i].id !== id) { continue; }
    var b = bookings[i];

    idField.value = b.id;
    serviceField.value = b.service;
    dateField.value = b.date;
    nameField.value = b.name;
    emailField.value = b.email;
    phoneField.value = b.phone;
    notesField.value = b.notes;
    updateTimes(b.time);

    formTitle.textContent = "Edit booking";
    saveBtn.textContent = "Save changes";
    cancelBtn.hidden = false;
    showMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}


/* ===== 9. DELETE ===== */

function deleteBooking(id) {
  if (!confirm("Delete this booking?")) { return; }

  bookings = bookings.filter(function (b) { return b.id !== id; });
  storeBookings(bookings);

  // If we were editing the deleted booking, clear the form
  if (idField.value === id) { resetForm(); }
  renderList();
  updateTimes();
}


/* ===== 10. RESET + START ===== */

function resetForm() {
  form.reset();
  idField.value = "";
  formTitle.textContent = "New booking";
  saveBtn.textContent = "Book appointment";
  cancelBtn.hidden = true;
  showMessage("");
  dateField.min = todayString();
  updateTimes();
}

// Fill the service dropdown from the SERVICES list
function buildServiceOptions() {
  for (var i = 0; i < SERVICES.length; i++) {
    var option = document.createElement("option");
    option.value = SERVICES[i].name;
    option.textContent = SERVICES[i].name + " (" + SERVICES[i].minutes + " min)";
    serviceField.appendChild(option);
  }
}

// Events
form.addEventListener("submit", saveBooking);
cancelBtn.addEventListener("click", resetForm);
dateField.addEventListener("change", function () { updateTimes(); });
serviceField.addEventListener("change", function () { updateTimes(); });
searchField.addEventListener("input", renderList);

// Go
buildServiceOptions();
resetForm();
renderList();
