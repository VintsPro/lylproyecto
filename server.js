require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('./db'); // Conexión a PostgreSQL (Supabase)
const { buildCatalogHtml } = require('./catalogTemplate');

// Configuración de Cloudinary para almacenamiento en la nube
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const app = express();
app.use(cors());
app.use(express.json());

// Carpetas públicas (ya no requerimos la carpeta local 'images' para la nube)
const ASSETS_DIR = path.join(__dirname, 'assets');
const OUTPUT_DIR = path.join(__dirname, 'output');

if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(path.join(OUTPUT_DIR, 'assets'))) fs.mkdirSync(path.join(OUTPUT_DIR, 'assets'), { recursive: true });

app.use('/assets', express.static(ASSETS_DIR));
app.use('/', express.static(path.join(__dirname, 'public')));

// Configuración del almacenamiento de Multer directo a Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'lyl-makeup-products', // Carpeta creada automáticamente en Cloudinary
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
  },
});
const upload = multer({ storage });

// ==================== CATEGORÍAS ====================

// Listar / buscar categorías
app.get('/api/categories', async (req, res) => {
  try {
    const search = req.query.search || '';
    const query = `
      SELECT c.id, c.name, c.created_at,
             (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
      FROM categories c
      WHERE c.name ILIKE $1
      ORDER BY c.name ASC
    `;
    const result = await pool.query(query, [`%${search}%`]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear categoría
app.post('/api/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    
    const query = 'INSERT INTO categories (name) VALUES ($1) RETURNING *';
    const result = await pool.query(query, [name.trim()]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Esa categoría ya existe' });
    res.status(500).json({ error: err.message });
  }
});

// Editar categoría
app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });
    
    const query = 'UPDATE categories SET name = $1 WHERE id = $2';
    await pool.query(query, [name.trim(), req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar categoría (bloquea si tiene productos)
app.delete('/api/categories/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT COUNT(*) AS total FROM products WHERE category_id = $1', [req.params.id]);
    if (parseInt(check.rows[0].total) > 0) {
      return res.status(400).json({ error: 'No puedes eliminar una categoría con productos asociados' });
    }
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Obtener una categoría específica por su ID
app.get('/api/categories/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const query = 'SELECT id, name, created_at FROM categories WHERE id = $1';
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PRODUCTOS ====================

// Listar / buscar / filtrar productos (con sus imágenes de Cloudinary)
app.get('/api/products', async (req, res) => {
  try {
    const search = req.query.search || '';
    const categoryId = req.query.category_id || null;

    let query = `
      SELECT p.*, c.name AS category_name
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.name ILIKE $1
    `;
    const params = [`%${search}%`];

    if (categoryId) {
      params.push(categoryId);
      query += ` AND p.category_id = $${params.length}`;
    }

    query += ` ORDER BY p.created_at DESC`;

    const result = await pool.query(query, params);
    const products = result.rows;

    if (products.length) {
      const ids = products.map(p => p.id);
      const imgResult = await pool.query(
        'SELECT * FROM product_images WHERE product_id = ANY($1::int[]) ORDER BY sort_order ASC',
        [ids]
      );
      
      products.forEach(p => {
        p.images = imgResult.rows.filter(i => i.product_id === p.id);
      });
    }

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crear producto (sube las imágenes directo a Cloudinary y guarda la URL completa)
app.post('/api/products', upload.array('images', 10), async (req, res) => {
  try {
    const { name, category_id, description, price, stock } = req.body;
    if (!name || !category_id) return res.status(400).json({ error: 'Nombre y categoría son obligatorios' });

    const insertQuery = `
      INSERT INTO products (category_id, name, description, price, stock)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const result = await pool.query(insertQuery, [
      category_id,
      name.trim(),
      description || null,
      price || 0,
      stock || 0
    ]);

    const product = result.rows[0];

    if (req.files && req.files.length) {
      for (let i = 0; i < req.files.length; i++) {
        // req.files[i].path contiene la URL pública y segura devuelta por Cloudinary
        await pool.query(
          'INSERT INTO product_images (product_id, filename, sort_order) VALUES ($1, $2, $3)',
          [product.id, req.files[i].path, i]
        );
      }
    }

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Editar producto (permite agregar más imágenes a Cloudinary)
app.put('/api/products/:id', upload.array('images', 10), async (req, res) => {
  try {
    const { name, category_id, description, price, stock } = req.body;
    
    const updateQuery = `
      UPDATE products 
      SET category_id = $1, name = $2, description = $3, price = $4, stock = $5
      WHERE id = $6
    `;
    await pool.query(updateQuery, [
      category_id,
      name.trim(),
      description || null,
      price || 0,
      stock || 0,
      req.params.id
    ]);

    if (req.files && req.files.length) {
      const countResult = await pool.query(
        'SELECT COUNT(*) AS total FROM product_images WHERE product_id = $1',
        [req.params.id]
      );
      let nextOrder = parseInt(countResult.rows[0].total);

      for (const file of req.files) {
        await pool.query(
          'INSERT INTO product_images (product_id, filename, sort_order) VALUES ($1, $2, $3)',
          [req.params.id, file.path, nextOrder++]
        );
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar producto (limpia sus registros de imágenes en la base de datos)
app.delete('/api/products/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM product_images WHERE product_id = $1', [req.params.id]);
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Eliminar UNA imagen específica de un producto
app.delete('/api/products/:id/images/:imageId', async (req, res) => {
  try {
    await pool.query('DELETE FROM product_images WHERE id = $1', [req.params.imageId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Ajuste rápido de inventario (+1 / -1 / cualquier delta)
app.patch('/api/products/:id/stock', async (req, res) => {
  try {
    const { delta } = req.body;
    const query = `
      UPDATE products 
      SET stock = CASE WHEN stock + $1 < 0 THEN 0 ELSE stock + $1 END 
      WHERE id = $2
    `;
    await pool.query(query, [delta, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CATÁLOGO (genera el HTML estático) ====================

app.post('/api/catalog/generate', async (req, res) => {
  try {
    const cats = await pool.query('SELECT * FROM categories ORDER BY name ASC');
    const prods = await pool.query(`
      SELECT p.*, c.name AS category_name FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.active = true OR p.active IS NULL
      ORDER BY p.name ASC
    `);
    const imgs = await pool.query('SELECT * FROM product_images ORDER BY sort_order ASC');

    const categories = cats.rows.map(c => ({
      id: c.id,
      name: c.name,
      products: prods.rows
        .filter(p => p.category_id === c.id)
        .map(p => ({
          id: p.id,
          name: p.name,
          description: p.description,
          price: p.price,
          stock: p.stock,
          // Como ya guardamos la URL completa de Cloudinary, la pasamos directamente sin copiar archivos locales
          images: imgs.rows.filter(i => i.product_id === p.id).map(i => i.filename)
        }))
    })).filter(c => c.products.length > 0);

    const html = buildCatalogHtml(categories);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html, 'utf8');

    // Copia la carpeta assets/ completa a output/assets
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

    res.json({ ok: true, path: 'output/index.html', totalProductos: prods.rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Panel admin:  http://localhost:${PORT}/admin.html`);
});