PANEL DE GALERÍA AGUARÁ LODGE

Archivos nuevos:
- admin-galeria.html
- admin-galeria.js
- gallery.js
- api/gallery-list.js
- api/_lib/gallery.js
- api/admin/gallery-list.js
- api/admin/gallery-create.js
- api/admin/gallery-update.js
- api/admin/gallery-delete.js
- SQL-galeria-aguara.sql

Variables de entorno nuevas en Vercel:
- SUPABASE_GALLERY_BUCKET=galeria

Ya usa también:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ADMIN_PASSWORD

Cómo dejarlo andando:
1) Ejecutar el SQL-galeria-aguara.sql en Supabase.
2) En Vercel agregar SUPABASE_GALLERY_BUCKET con valor galeria.
3) Redeploy.
4) Entrar a /admin-galeria.html
5) Guardar la misma contraseña del admin que ya usás.
6) Subir fotos.

Notas:
- La galería pública usa /api/gallery-list
- Si Supabase todavía no está listo, la página pública muestra las fotos viejas del sitio como respaldo.
- El panel permite crear, editar y borrar.
- Si editás una foto y reemplazás la imagen, también borra la imagen anterior en Storage.
