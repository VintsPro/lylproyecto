# Inventario DACA + Catálogo

App local simple: un panel para manejar **categorías** y **productos** (con varias fotos
cada uno) conectado a **SQL Server**, y un botón que te genera el **catálogo estático**
listo para subir a Netlify.

No tiene login ni capas de seguridad extra — es para uso local, tal como lo pediste.

## 1. Requisitos
- Node.js instalado (v18 o superior).
- SQL Server corriendo en tu máquina (127.0.0.1, puerto 1433), con el usuario `sa`.

## 2. Crear la base de datos
Abre **SSMS** (o `sqlcmd`) conectado como `sa`, abre el archivo `sql/schema.sql` y
ejecútalo completo. Esto crea la base `InventarioDaca` y las 3 tablas que usa la app
(`categories`, `products`, `product_images`).

## 3. Configurar
El archivo `.env` ya trae tus datos:
```
DB_SERVER=127.0.0.1
DB_DATABASE=InventarioDaca
DB_USER=sa
DB_PASSWORD=1234
DB_PORT=1433
PORT=3000
```
Si tu contraseña de `sa` es distinta, cámbiala aquí.

## 4. Instalar e iniciar
```bash
npm install
npm start
```
Verás en consola: `✅ Conectado a SQL Server` y `🚀 Servidor corriendo en http://localhost:3000`.

## 5. Usar el panel
Abre en tu navegador: **http://localhost:3000/admin.html**

- **Productos**: el corazón de la app. Crea, edita, borra, sube varias fotos por
  producto, y ajusta el stock con los botones `−` / `+` directo en la tabla.
- **Categorías**: crear categoría, buscador, editar y eliminar (no te deja borrar una
  categoría que todavía tiene productos).
- **Catálogo**: botón "Generar catálogo ahora". Esto crea la carpeta `output/` con:
  - `output/index.html` → tu catálogo público (mismo diseño del que ya tenías, con
    carrito y botón de WhatsApp), ahora con carrusel de fotos por producto.
  - `output/images/` → solo las fotos que sí se usan en el catálogo.

## 6. Publicar en Netlify
Arrastra la carpeta **`output`** completa a Netlify (o conéctala como sitio). Como
`index.html` está adentro junto con `images/`, no necesitas nada más — ese es justo el
"solo eso subo a Netlify" que pediste.

## 7. Dónde quedan las imágenes originales
Todas las fotos que subes desde el panel se guardan en la carpeta `images/` en la raíz
del proyecto (esa es tu "base" de imágenes). Cada vez que generas el catálogo, se copian
las necesarias a `output/images/`.

## Notas
- No hay historial de movimientos de inventario (entradas/salidas) para no complicar el
  proyecto — solo el número de stock actual, que puedes subir/bajar con un clic.
- Si quieres cambiar el nombre de la tienda, el número de WhatsApp o el texto del banner
  superior del catálogo, edítalo al inicio de `catalogTemplate.js` (variables
  `STORE_NAME`, `WHATSAPP_NUMBER`, `TOPBAR_TEXT`).
