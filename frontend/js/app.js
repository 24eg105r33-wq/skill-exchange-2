
const isLocalFrontend = location.protocol === 'file:' ||
  (['localhost', '127.0.0.1'].includes(location.hostname) && location.port !== '8080');
const API_BASE = window.API_BASE || (isLocalFrontend ? 'http://localhost:8080/api' : '/api');
const $ = selector => document.querySelector(selector);

let currentUser = readUser();
let cachedSkills = [];

function readUser() {
  try {
    return JSON.parse(localStorage.getItem('skillswapUser') || 'null');
  } catch {
    return null;
  }
}

// Supports camelCase and snake_case API fields.
function field(object, ...names) {
  for (const name of names) {
    if (object?.[name] !== undefined && object[name] !== null) {
      return object[name];
    }
  }
  return '';
}

function userId(user = currentUser) {
  return Number(field(user, 'id', 'userId', 'user_id', 'studentId', 'student_id'));
}

function requestId(request) {
  return Number(field(request, 'id', 'requestId', 'request_id'));
}

function requestStatus(request) {
  return String(
    field(request, 'status', 'requestStatus', 'request_status')
  ).trim().toUpperCase();
}

function ownerId(request) {
  return Number(field(
    request,
    'ownerId',
    'owner_id',
    'skillOwnerId',
    'skill_owner_id',
    'studentId',
    'student_id'
  ));
}

function requesterId(request) {
  return Number(field(
    request,
    'requesterId',
    'requester_id',
    'requestedBy',
    'requested_by'
  ));
}

function setMessage(id, text, type = 'success') {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = text;
  element.className = `form-message ${type}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

async function api(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    });
  } catch {
    throw new Error(
      'Cannot connect to the backend. Start Spring Boot on port 8080.'
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message || data.error || `Request failed (${response.status})`
    );
  }

  return data;
}

// -------------------- USER UI --------------------

function updateUserUI() {
  const welcome = $('#welcome');
  const logoutBtn = $('#logoutBtn');
  const id = userId();

  if (welcome) {
    welcome.textContent = currentUser
      ? `Hi, ${field(currentUser, 'fullName', 'full_name', 'email') || 'Student'}`
      : 'Welcome, student';
  }

  logoutBtn?.classList.toggle('hidden', !currentUser);

  [
    '#skillOwner',
    '#requestUser',
    'select[name="requesterId"]'
  ].forEach(selector => {
    const select = $(selector);
    if (!select) return;

    select.innerHTML = currentUser
      ? `<option value="${id}">${escapeHtml(
          field(currentUser, 'fullName', 'full_name', 'email') || 'Student'
        )}</option>`
      : '<option value="">Sign in first</option>';
  });
}

function saveUser(user) {
  currentUser = user;
  localStorage.setItem('skillswapUser', JSON.stringify(user));

  updateUserUI();
  refreshRequests();
  loadFeedbackRequests();
}

function logout() {
  currentUser = null;
  localStorage.removeItem('skillswapUser');

  updateUserUI();

  if ($('#requestsList')) {
    $('#requestsList').innerHTML =
      '<div class="empty-state">Sign in to view requests.</div>';
  }

  loadFeedbackRequests();
}

// -------------------- REGISTER --------------------

$('#registerForm')?.addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    const user = await api('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    saveUser(user);
    form.reset();

    setMessage(
      'registerMessage',
      'Account created successfully. You are now signed in.'
    );

    await loadSkills();
  } catch (error) {
    setMessage('registerMessage', error.message, 'error');
  }
});

// -------------------- LOGIN --------------------

$('#loginForm')?.addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  try {
    const user = await api('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    saveUser(user);
    form.reset();

    setMessage('loginMessage', 'Signed in successfully.');
    await loadSkills();
  } catch (error) {
    setMessage('loginMessage', error.message, 'error');
  }
});

// -------------------- LOGOUT AND NAVIGATION --------------------

$('#logoutBtn')?.addEventListener('click', logout);

$('#heroAccount')?.addEventListener('click', () => {
  $('#account')?.scrollIntoView({ behavior: 'smooth' });
});

$('#addSkillBtn')?.addEventListener('click', () => {
  $('#skillForm')?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  });

  if (!currentUser) {
    setMessage(
      'skillMessage',
      'Please create an account or sign in first.',
      'error'
    );
  }
});

// -------------------- PUBLISH A SKILL --------------------

$('#skillForm')?.addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;

  if (!currentUser) {
    setMessage('skillMessage', 'Please sign in first.', 'error');
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  data.studentId = userId();

  try {
    await api('/skills', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    form.reset();
    updateUserUI();

    setMessage('skillMessage', 'Your skill listing has been published.');
    await loadSkills();
  } catch (error) {
    setMessage('skillMessage', error.message, 'error');
  }
});

// -------------------- SEARCH AND FILTER SKILLS --------------------

$('#searchBtn')?.addEventListener('click', loadSkills);

$('#searchInput')?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadSkills();
  }
});

$('#typeFilter')?.addEventListener('change', loadSkills);

async function loadSkills() {
  const grid = $('#skillsGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-state">Loading skill listings…</div>';

  const params = new URLSearchParams();
  const search = $('#searchInput')?.value.trim();
  const type = $('#typeFilter')?.value;

  if (search) params.set('q', search);
  if (type) params.set('type', type);

  try {
    cachedSkills = await api(
      '/skills' + (params.toString() ? `?${params.toString()}` : '')
    );

    renderSkills();
  } catch (error) {
    grid.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderSkills() {
  const grid = $('#skillsGrid');
  if (!grid) return;

  if (!cachedSkills.length) {
    grid.innerHTML =
      '<div class="empty-state">No listings yet. Publish the first skill listing.</div>';
    return;
  }

  grid.innerHTML = cachedSkills.map(skill => {
    const id = Number(field(skill, 'id', 'skillId', 'skill_id'));
    const type = String(field(skill, 'skillType', 'skill_type')).toUpperCase();

    return `
      <article class="skill-card">
        <div class="skill-top">
          <span class="pill ${type === 'LEARN' ? 'learn' : ''}">
            ${type === 'TEACH' ? 'CAN TEACH' : 'WANTS TO LEARN'}
          </span>
        </div>

        <h3>${escapeHtml(field(skill, 'skillName', 'skill_name'))}</h3>
        <p>${escapeHtml(field(skill, 'description'))}</p>

        <div class="skill-meta">
          ${escapeHtml(field(skill, 'studentName', 'student_name', 'fullName', 'full_name'))}
          · ${escapeHtml(field(skill, 'department') || 'Student')}
        </div>

        <button class="btn" data-request="${id}" type="button">
          Request exchange
        </button>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('[data-request]').forEach(button => {
    button.addEventListener('click', () => {
      openRequest(Number(button.dataset.request));
    });
  });
}

// -------------------- CREATE EXCHANGE REQUEST --------------------

function openRequest(skillId) {
  if (!currentUser) {
    $('#account')?.scrollIntoView({ behavior: 'smooth' });
    setMessage('loginMessage', 'Sign in before requesting a skill.', 'error');
    return;
  }

  const skill = cachedSkills.find(item =>
    Number(field(item, 'id', 'skillId', 'skill_id')) === skillId
  );

  if (!skill) return;

  const skillOwner = Number(field(
    skill,
    'studentId',
    'student_id',
    'ownerId',
    'owner_id'
  ));

  if (skillOwner === userId()) {
    alert('You cannot request your own listing.');
    return;
  }

  const form = $('#requestForm');
  if (!form) return;

  form.elements.skillId.value = skillId;
  form.elements.message.value = '';
  $('#requestMessage').textContent = '';
  form.elements.requesterId.value = String(userId());

  $('#requestDialog')?.showModal();
}

$('#closeDialog')?.addEventListener('click', () => {
  $('#requestDialog')?.close();
});

$('#requestForm')?.addEventListener('submit', async event => {
  event.preventDefault();

  const form = event.currentTarget;

  if (!currentUser) {
    setMessage('requestMessage', 'Please sign in first.', 'error');
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  data.skillId = Number(data.skillId);
  data.requesterId = userId();

  try {
    await api('/requests', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    $('#requestDialog')?.close();
    setMessage('requestMessage', 'Request sent successfully.');

    await refreshRequests();
  } catch (error) {
    setMessage('requestMessage', error.message, 'error');
  }
});

// -------------------- VIEW EXCHANGE REQUESTS --------------------

$('#refreshRequests')?.addEventListener('click', refreshRequests);

async function refreshRequests() {
  const root = $('#requestsList');
  if (!root) return;

  if (!currentUser) {
    root.innerHTML =
      '<div class="empty-state">Sign in to view requests.</div>';
    return;
  }

  root.innerHTML = '<div class="empty-state">Loading requests…</div>';

  try {
    const requests = await api(`/requests?studentId=${userId()}`);

    if (!Array.isArray(requests) || requests.length === 0) {
      root.innerHTML =
        '<div class="empty-state">No exchange requests yet. Browse skill listings and send a request to get started.</div>';
      return;
    }

    root.innerHTML = requests.map(request => {
      const id = requestId(request);
      const status = requestStatus(request);
      const owner = ownerId(request);
      const isOwner = owner === userId();

      let actions = '';

      if (isOwner && status === 'PENDING') {
        actions = `
          <button class="btn" type="button" data-accept="${id}">
            Accept
          </button>
          <button class="btn btn-outline" type="button" data-reject="${id}">
            Reject
          </button>
        `;
      }

      if (isOwner && status === 'ACCEPTED') {
        actions = `
          <button class="btn" type="button" data-complete="${id}">
            Mark Completed
          </button>
        `;
      }

      return `
        <article class="request-item">
          <div>
            <strong>${escapeHtml(field(request, 'skillName', 'skill_name') || 'Skill exchange')}</strong>
            <p>
              ${escapeHtml(field(request, 'requesterName', 'requester_name') || 'Student')}
              → ${escapeHtml(field(request, 'ownerName', 'owner_name') || 'Student')}
            </p>
            <p>${escapeHtml(field(request, 'message'))}</p>
          </div>

          <div>
            <span class="status ${escapeHtml(status.toLowerCase())}">
              ${escapeHtml(status || 'UNKNOWN')}
            </span>
            ${actions}
          </div>
        </article>
      `;
    }).join('');

    root.querySelectorAll('[data-accept]').forEach(button => {
      button.addEventListener('click', () => {
        changeStatus(Number(button.dataset.accept), 'ACCEPTED');
      });
    });

    root.querySelectorAll('[data-reject]').forEach(button => {
      button.addEventListener('click', () => {
        changeStatus(Number(button.dataset.reject), 'REJECTED');
      });
    });

    root.querySelectorAll('[data-complete]').forEach(button => {
      button.addEventListener('click', () => {
        changeStatus(Number(button.dataset.complete), 'COMPLETED');
      });
    });
  } catch (error) {
    root.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

// -------------------- UPDATE REQUEST STATUS --------------------

async function changeStatus(id, status) {
  if (!currentUser) return;

  try {
    await api(`/requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({
        studentId: userId(),
        status
      })
    });

    await refreshRequests();
    await loadFeedbackRequests();

    if (status === 'COMPLETED') {
      setMessage(
        'feedbackMessage',
        'Exchange completed! Select it below to submit your feedback.'
      );

      $('#feedback')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  } catch (error) {
    alert(error.message);
  }
}

// -------------------- FEEDBACK: COMPLETED EXCHANGES --------------------

async function loadFeedbackRequests() {
  const select = $('#feedbackRequest');
  if (!select) return;

  select.innerHTML =
    '<option value="">Select a completed exchange</option>';

  if (!currentUser) return;

  try {
    const requests = await api(`/requests?studentId=${userId()}`);

    requests
      .filter(request => requestStatus(request) === 'COMPLETED')
      .forEach(request => {
        const option = document.createElement('option');
        option.value = requestId(request);
        option.textContent =
          `${field(request, 'skillName', 'skill_name') || 'Skill exchange'} — ` +
          `${field(request, 'requesterName', 'requester_name') || 'Student'} / ` +
          `${field(request, 'ownerName', 'owner_name') || 'Student'}`;

        select.appendChild(option);
      });

    if (select.options.length === 1) {
      select.options[0].textContent =
        'No completed exchanges available yet';
    }
  } catch (error) {
    setMessage('feedbackMessage', error.message, 'error');
  }
}

// -------------------- SUBMIT FEEDBACK --------------------

const feedbackForm = $('#feedbackForm');

feedbackForm?.addEventListener('submit', async event => {
  event.preventDefault();

  if (!currentUser) {
    setMessage('feedbackMessage', 'Please log in first.', 'error');
    return;
  }

  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));

  if (!data.requestId) {
    setMessage(
      'feedbackMessage',
      'Please select a completed exchange.',
      'error'
    );
    return;
  }

  data.requestId = Number(data.requestId);
  data.studentId = userId();
  data.rating = Number(data.rating);

  try {
    const result = await api('/feedback', {
      method: 'POST',
      body: JSON.stringify(data)
    });

    setMessage(
      'feedbackMessage',
      result.message || 'Feedback submitted successfully.'
    );

    form.reset();
    await loadFeedbackRequests();
  } catch (error) {
    setMessage('feedbackMessage', error.message, 'error');
  }
});

// -------------------- BACKEND STATUS --------------------

async function checkBackend() {
  const status = $('#apiStatus');
  if (!status) return;

  try {
    const data = await api('/health');

    status.textContent =
      `Backend ${data.status} · Database ${data.database}`;
    status.style.color = '#178b66';
  } catch {
    status.textContent = 'Backend not connected — start Spring Boot';
    status.style.color = '#b42318';
  }
}

// -------------------- INITIALIZE PAGE --------------------

updateUserUI();
checkBackend();
loadSkills();
refreshRequests();
loadFeedbackRequests();
