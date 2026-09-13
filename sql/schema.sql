-- =========================================================
-- InventarioDaca - Script de base de datos (version simple)
-- Ejecutar UNA vez en SSMS o con sqlcmd, conectado como 'sa'
-- =========================================================


--CREATE DATABASE lyl;


--USE lyl
--GO

-- ---------- Categorias ----------
IF OBJECT_ID('dbo.categories', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.categories (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        name        NVARCHAR(100) NOT NULL UNIQUE,
        created_at  DATETIME NOT NULL DEFAULT GETDATE()
    );
END
GO

-- ---------- Productos ----------
IF OBJECT_ID('dbo.products', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.products (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        category_id  INT NOT NULL,
        name         NVARCHAR(200) NOT NULL,
        description  NVARCHAR(500) NULL,
        price        DECIMAL(12,2) NOT NULL DEFAULT 0,
        stock        INT NOT NULL DEFAULT 0,
        active       BIT NOT NULL DEFAULT 1,
        created_at   DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_products_category FOREIGN KEY (category_id)
            REFERENCES dbo.categories(id)
    );
END
GO

-- ---------- Imagenes de producto (varias por producto) ----------
IF OBJECT_ID('dbo.product_images', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.product_images (
        id          INT IDENTITY(1,1) PRIMARY KEY,
        product_id  INT NOT NULL,
        filename    NVARCHAR(255) NOT NULL,
        sort_order  INT NOT NULL DEFAULT 0,
        CONSTRAINT FK_images_product FOREIGN KEY (product_id)
            REFERENCES dbo.products(id) ON DELETE CASCADE
    );
END
GO

-- Datos de ejemplo (opcional, puedes borrar estas 3 lineas si no las quieres)
IF NOT EXISTS (SELECT 1 FROM dbo.categories)
BEGIN
    INSERT INTO dbo.categories (name) VALUES (N'Atenea'), (N'Trendy'), (N'Bloomshell');
END
GO
