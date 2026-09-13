require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { sql, poolPromise } = require('./db');
const { buildCatalogHtml } = require('./catalogTemplate');

const app = express();
app.use(cors());
app.use(express.json());

// Carpetas públicas: /images sirve las fotos, /public sirve el panel admin
const IMAGES_DIR = path.join(__dirname, 'images');
const ASSETS_DIR = path.join(__dirname, 'assets'); // portada, og-image (imágenes del sitio, no de productos)
const OUTPUT_DIR = path.join(__dirname, 'output');
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);
if (!fs.existsSync(path.join(OUTPUT_DIR, 'images'))) fs.mkdirSync(path.join(OUTPUT_DIR, 'images'));
if (!fs.existsSync(path.join(OUTPUT_DIR, 'assets'))) fs.mkdirSync(path.join(OUTPUT_DIR, 'assets'));

app.use('/images', express.static(IMAGES_DIR));
app.use('/assets', express.static(ASSETS_DIR));
app.use('/', express.static(path.join(__dirname, 'public')));

// Subida de imágenes: se guardan directo en /images con nombre único
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '');
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + '-' + safe);
  }
});
const upload = multer({ storage });

// ==================== CATEGORÍAS ====================

// Listar / buscar categorías
app.get('/api/categories', async (req, res) => {
  try {
    const pool = await poolPromise;
    const search = req.query.search || '';
    const result = await pool.request()
      .input('search', sql.NVarChar, `%${search}%`)
      .query(`
        SELECT c.id, c.name, c.created_at,
               (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
        FROM categories c
        WHERE c.name LIKE @search
        ORDER BY c.name ASC
      `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear categoría
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const pool = await poolPromise;
    const result = await pool.request()
      .input('name', sql.NVarChar, name.trim())
      .query('INSERT INTO categories (name) OUTPUT INSERTED.* VALUES (@name)');
    res.status(201).json(result.recordset[0]);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Esa categoría ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// Editar categoría
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name.trim())
      .query('UPDATE categories SET name = @name WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar categoría (bloquea si tiene productos)
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const check = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT COUNT(*) AS total FROM products WHERE category_id = @id');
    if (check.recordset[0].total > 0) {
      return res.status(400).json({ error: 'No puedes eliminar una categoría con productos asociados' });
    }
    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM categories WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PRODUCTOS ====================

// Listar / buscar / filtrar productos (con sus imágenes)
app.get('/api/products', async (req, res) => {
  try {
    const pool = await poolPromise;
    const search = req.query.search || '';
    const categoryId = req.query.category_id || null;

    const result = await pool.request()
      .input('search', sql.NVarChar, `%${search}%`)
      .input('categoryId', sql.Int, categoryId)
      .query(`
        SELECT p.*, c.name AS category_name
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.name LIKE @search
          AND (@categoryId IS NULL OR p.category_id = @categoryId)
        ORDER BY p.created_at DESC
      `);

    const products = result.recordset;
    if (products.length) {
      const ids = products.map(p => p.id);
      const imgResult = await pool.request().query(`
        SELECT * FROM product_images WHERE product_id IN (${ids.join(',')}) ORDER BY sort_order ASC
      `);
      products.forEach(p => {
        p.images = imgResult.recordset.filter(i => i.product_id === p.id);
      });
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear producto (con varias imágenes)
app.post('/api/products', upload.array('images', 10), async (req, res) => {
  try {
    const { name, category_id, description, price, stock } = req.body;
    if (!name || !category_id) return res.status(400).json({ error: 'Nombre y categoría son obligatorios' });

    const pool = await poolPromise;
    const result = await pool.request()
      .input('category_id', sql.Int, category_id)
      .input('name', sql.NVarChar, name.trim())
      .input('description', sql.NVarChar, description || null)
      .input('price', sql.Decimal(12, 2), price || 0)
      .input('stock', sql.Int, stock || 0)
      .query(`
        INSERT INTO products (category_id, name, description, price, stock)
        OUTPUT INSERTED.*
        VALUES (@category_id, @name, @description, @price, @stock)
      `);

    const product = result.recordset[0];

    if (req.files && req.files.length) {
      for (let i = 0; i < req.files.length; i++) {
        await pool.request()
          .input('product_id', sql.Int, product.id)
          .input('filename', sql.NVarChar, req.files[i].filename)
          .input('sort_order', sql.Int, i)
          .query('INSERT INTO product_images (product_id, filename, sort_order) VALUES (@product_id, @filename, @sort_order)');
      }
    }
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar producto (puede agregar más imágenes)
app.put('/api/products/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { name, category_id, description, price, stock } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('category_id', sql.Int, category_id)
      .input('name', sql.NVarChar, name.trim())
      .input('description', sql.NVarChar, description || null)
      .input('price', sql.Decimal(12, 2), price || 0)
      .input('stock', sql.Int, stock || 0)
      .query(`
        UPDATE products SET category_id=@category_id, name=@name, description=@description,
               price=@price, stock=@stock
        WHERE id=@id
      `);

    if (req.files && req.files.length) {
      const countResult = await pool.request()
        .input('id', sql.Int, req.params.id)
        .query('SELECT COUNT(*) AS total FROM product_images WHERE product_id = @id');
      let nextOrder = countResult.recordset[0].total;
      for (const file of req.files) {
        await pool.request()
          .input('product_id', sql.Int, req.params.id)
          .input('filename', sql.NVarChar, file.filename)
          .input('sort_order', sql.Int, nextOrder++)
          .query('INSERT INTO product_images (product_id, filename, sort_order) VALUES (@product_id, @filename, @sort_order)');
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar producto (borra también sus imágenes del disco)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const pool = await poolPromise;
    const imgs = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT filename FROM product_images WHERE product_id = @id');

    await pool.request().input('id', sql.Int, req.params.id).query('DELETE FROM products WHERE id = @id');

    imgs.recordset.forEach(img => {
      const filePath = path.join(IMAGES_DIR, img.filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar UNA imagen de un producto
app.delete('/api/products/:id/images/:imageId', async (req, res) => {
  try {
    const pool = await poolPromise;
    const img = await pool.request()
      .input('imageId', sql.Int, req.params.imageId)
      .query('SELECT filename FROM product_images WHERE id = @imageId');

    if (img.recordset.length) {
      const filePath = path.join(IMAGES_DIR, img.recordset[0].filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await pool.request().input('imageId', sql.Int, req.params.imageId).query('DELETE FROM product_images WHERE id = @imageId');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ajuste rápido de inventario (+1 / -1 / cualquier delta)
app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const { delta } = req.body;
    const pool = await poolPromise;
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('delta', sql.Int, delta)
      .query('UPDATE products SET stock = CASE WHEN stock + @delta < 0 THEN 0 ELSE stock + @delta END WHERE id = @id');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CATÁLOGO (genera el HTML estático) ====================

app.post('/api/catalog/generate', async (req, res) => {
  try {
    const pool = await poolPromise;
    const cats = await pool.request().query('SELECT * FROM categories ORDER BY name ASC');
    const prods = await pool.request().query(`
      SELECT p.*, c.name AS category_name FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.active = 1
      ORDER BY p.name ASC
    `);
    const imgs = await pool.request().query('SELECT * FROM product_images ORDER BY sort_order ASC');

    const categories = cats.recordset.map(c => ({
      id: c.id,
      name: c.name,
      products: prods.recordset
        .filter(p => p.category_id === c.id)
        .map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          stock: p.stock,
          images: imgs.recordset.filter(i => i.product_id === p.id).map(i => i.filename)
        }))
    })).filter(c => c.products.length > 0);

    const html = buildCatalogHtml(categories);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');

    // Copia solo las imágenes usadas en el catálogo a output/images
    const usedFiles = new Set();
    categories.forEach(c => c.products.forEach(p => p.images.forEach(f => usedFiles.add(f))));
    const outImagesDir = path.join(OUTPUT_DIR, 'images');
    fs.readdirSync(outImagesDir).forEach(f => fs.unlinkSync(path.join(outImagesDir, f))); // limpia versión previa
    usedFiles.forEach(f => {
      const src = path.join(IMAGES_DIR, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(outImagesDir, f));
    });

    // Copia la carpeta assets/ completa (portada, og-image) a output/assets
    const outAssetsDir = path.join(OUTPUT_DIR, 'assets');
    if (fs.existsSync(outAssetsDir)) {
      fs.readdirSync(outAssetsDir).forEach(f => fs.unlinkSync(path.join(outAssetsDir, f)));
    }
    if (fs.existsSync(ASSETS_DIR)) {
      fs.readdirSync(ASSETS_DIR).forEach(f => {
        const src = path.join(ASSETS_DIR, f);
        if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(outAssetsDir, f));
      });
    }

    res.json({ ok: true, path: 'output/index.html', totalProductos: prods.recordset.length, totalImagenes: usedFiles.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Panel admin:  http://localhost:${PORT}/admin.html`);
});
