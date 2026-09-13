// --- SISTEMA DE SEGURIDAD (ADMIN) ---
const ADMIN_PASSWORD = "TuClaveSecreta123"; // <--- CAMBIA ESTA CONTRASEÑA POR LA TUYA

document.addEventListener("DOMContentLoaded", () => {
    const loginOverlay = document.getElementById("loginOverlay");
    const passInput = document.getElementById("adminPassInput");
    const loginBtn = document.getElementById("adminLoginBtn");
    const errorMsg = document.getElementById("adminErrorMsg");

    // Verificar si ya se había ingresado la contraseña antes en este navegador
    if (sessionStorage.getItem("admin_authenticated") === "true") {
        if (loginOverlay) loginOverlay.style.display = "none";
    }

    function validarPassword() {
        if (passInput.value === ADMIN_PASSWORD) {
            sessionStorage.setItem("admin_authenticated", "true");
            if (loginOverlay) loginOverlay.style.display = "none";
        } else {
            if (errorMsg) errorMsg.style.display = "block";
            passInput.value = "";
        }
    }

    if (loginBtn) {
        loginBtn.addEventListener("click", validarPassword);
    }

    if (passInput) {
        passInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") validarPassword();
        });
    }
});
const API = ''; // mismo origen (http://localhost:3000)

// ---------- Utilidades ----------
function formatCOP(n) {
  return '$' + Math.round(n).toLocaleString('es-CO');
}
function showMsg(elId, text, type) {
  const el = document.getElementById(elId);
  el.innerHTML = `<div class="msg ${type}">${text}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 4000);
}

// ---------- Tabs ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.tab).classList.add('active');
  });
});

// ==================== CATEGORÍAS ====================

let allCategories = [];

async function loadCategories() {
  const search = document.getElementById('cat-search').value;
  const res = await fetch(`${API}/api/categories?search=${encodeURIComponent(search)}`);
  const data = await res.json();
  allCategories = data;
  renderCategoriesTable(data);
  fillCategorySelects(data);
}

function renderCategoriesTable(cats) {
  const tbody = document.getElementById('categories-tbody');
  tbody.innerHTML = cats.map(c => `
    <tr data-id="${c.id}">
      <td class="cat-name-cell">${c.name}</td>
      <td>${c.product_count}</td>
      <td class="actions">
        <button class="btn small secondary" onclick="editCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')">Editar</button>
        <button class="btn small danger" onclick="deleteCategory(${c.id})">Eliminar</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="3" style="color:#999;">Sin categorías todavía.</td></tr>';
}

function fillCategorySelects(cats) {
  const opts = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  document.getElementById('prod-filter-cat').innerHTML = '<option value="">Todas</option>' + opts;
  document.getElementById('p-category').innerHTML = opts;
}

document.getElementById('btn-add-cat').addEventListener('click', async () => {
  const name = document.getElementById('new-cat-name').value.trim();
  if (!name) return;
  const res = await fetch(`${API}/api/categories`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
  });
  const data = await res.json();
  if (!res.ok) return showMsg('cat-msg', data.error, 'error');
  document.getElementById('new-cat-name').value = '';
  showMsg('cat-msg', 'Categoría creada ✓', 'ok');
  loadCategories();
});

window.editCategory = async (id, currentName) => {
  const name = prompt('Nuevo nombre de la categoría:', currentName);
  if (!name || !name.trim() || name.trim() === currentName) return;
  const res = await fetch(`${API}/api/categories/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() })
  });
  const data = await res.json();
  if (!res.ok) return showMsg('cat-msg', data.error, 'error');
  loadCategories();
};

window.deleteCategory = async (id) => {
  if (!confirm('¿Eliminar esta categoría?')) return;
  const res = await fetch(`${API}/api/categories/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) return showMsg('cat-msg', data.error, 'error');
  loadCategories();
};

document.getElementById('cat-search').addEventListener('input', debounce(loadCategories, 300));

// ==================== PRODUCTOS ====================

async function loadProducts() {
  const search = document.getElementById('prod-search').value;
  const categoryId = document.getElementById('prod-filter-cat').value;
  const params = new URLSearchParams({ search });
  if (categoryId) params.set('category_id', categoryId);
  const res = await fetch(`${API}/api/products?${params.toString()}`);
  const data = await res.json();
  renderProductsTable(data);
}

function renderProductsTable(products) {
  const tbody = document.getElementById('products-tbody');
  tbody.innerHTML = products.map(p => {
    const thumbs = (p.images || []).slice(0, 3).map(img => `<img src="${API}/images/${img.filename}">`).join('');
    const low = p.stock <= 3;
    return `
    <tr data-id="${p.id}">
      <td><div class="thumbs">${thumbs || '—'}</div></td>
      <td>${p.name}</td>
      <td>${p.category_name}</td>
      <td>${formatCOP(p.price)}</td>
      <td>
        <span class="badge-stock ${low ? 'low' : 'ok'}">${p.stock}</span>
        <span class="stock-ctl">
          <button onclick="adjustStock(${p.id}, -1)">−</button>
          <button onclick="adjustStock(${p.id}, 1)">+</button>
        </span>
      </td>
      <td class="actions">
        <button class="btn small secondary" onclick='openEditProduct(${JSON.stringify(p).replace(/'/g, "&apos;")})'>Editar</button>
        <button class="btn small danger" onclick="deleteProduct(${p.id})">Eliminar</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:#999;">Sin productos todavía.</td></tr>';
}

window.adjustStock = async (id, delta) => {
  await fetch(`${API}/api/products/${id}/stock`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta })
  });
  loadProducts();
};

window.deleteProduct = async (id) => {
  if (!confirm('¿Eliminar este producto y sus imágenes?')) return;
  await fetch(`${API}/api/products/${id}`, { method: 'DELETE' });
  loadProducts();
};

document.getElementById('prod-search').addEventListener('input', debounce(loadProducts, 300));
document.getElementById('prod-filter-cat').addEventListener('change', loadProducts);

// ---------- Modal producto ----------
const dialog = document.getElementById('product-dialog');

document.getElementById('btn-new-product').addEventListener('click', () => {
  document.getElementById('product-form').reset();
  document.getElementById('p-id').value = '';
  document.getElementById('product-dialog-title').textContent = 'Nuevo producto';
  document.getElementById('existing-images-wrap').style.display = 'none';
  document.getElementById('existing-images').innerHTML = '';
  dialog.showModal();
});

window.openEditProduct = (p) => {
  document.getElementById('product-form').reset();
  document.getElementById('p-id').value = p.id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-category').value = p.category_id;
  document.getElementById('p-price').value = p.price;
  document.getElementById('p-stock').value = p.stock;
  document.getElementById('p-description').value = p.description || '';
  document.getElementById('product-dialog-title').textContent = 'Editar producto';

  const wrap = document.getElementById('existing-images-wrap');
  const cont = document.getElementById('existing-images');
  if (p.images && p.images.length) {
    wrap.style.display = 'flex';
    cont.innerHTML = p.images.map(img => `<img src="${API}/images/${img.filename}" title="Clic para eliminar" onclick="deleteProductImage(${p.id}, ${img.id}, this)">`).join('');
  } else {
    wrap.style.display = 'none';
  }
  dialog.showModal();
};

window.deleteProductImage = async (productId, imageId, imgEl) => {
  if (!confirm('¿Eliminar esta imagen?')) return;
  await fetch(`${API}/api/products/${productId}/images/${imageId}`, { method: 'DELETE' });
  imgEl.remove();
};

document.getElementById('close-product-dialog').addEventListener('click', () => dialog.close());
document.getElementById('cancel-product').addEventListener('click', () => dialog.close());

document.getElementById('product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const fd = new FormData();
  fd.append('name', document.getElementById('p-name').value.trim());
  fd.append('category_id', document.getElementById('p-category').value);
  fd.append('price', document.getElementById('p-price').value);
  fd.append('stock', document.getElementById('p-stock').value);
  fd.append('description', document.getElementById('p-description').value.trim());
  const files = document.getElementById('p-images').files;
  for (const f of files) fd.append('images', f);

  const url = id ? `${API}/api/products/${id}` : `${API}/api/products`;
  const method = id ? 'PUT' : 'POST';
  const res = await fetch(url, { method, body: fd });
  const data = await res.json();
  if (!res.ok) return showMsg('product-form-msg', data.error, 'error');
  dialog.close();
  loadProducts();
});

// ==================== CATÁLOGO ====================

document.getElementById('btn-generate-catalog').addEventListener('click', async () => {
  const btn = document.getElementById('btn-generate-catalog');
  btn.disabled = true;
  btn.textContent = 'Generando...';
  try {
    const res = await fetch(`${API}/api/catalog/generate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    document.getElementById('catalog-result').innerHTML = `
      <div class="catalog-result">
        ✅ Catálogo generado con <b>${data.totalProductos}</b> productos y <b>${data.totalImagenes}</b> imágenes.<br>
        Archivo: <code>${data.path}</code><br>
        Sube la carpeta <b>output</b> (contiene <code>index.html</code> + carpeta <code>images</code>) a Netlify.
      </div>`;
  } catch (err) {
    document.getElementById('catalog-result').innerHTML = `<div class="msg error">${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generar catálogo ahora';
  }
});

// ---------- Helper debounce ----------
function debounce(fn, delay) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ---------- Inicio ----------
loadCategories().then(loadProducts);
