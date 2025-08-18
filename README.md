# normalizacion-react (Frontend)

## Pasos
1) `npm install`
2) Copia `.env.example` a `.env` (ajusta `VITE_API_URL` si el backend no está en 4000)
3) `npm run dev`

## Funciones
- Cargar CSV/Excel
- Seleccionar 1FN/2FN/3FN
- Visualizar ER con React Flow
- Exportar CSV (ZIP) y SQL
- Listar/cargar tablas desde SQL Server
- Subir normalización al backend



## Para resumir el funcionamiento:

- Al cargar un archivo (CSV o Excel) se normaliza la data y se almacena en el estado "data".

- Al presionar "Analizar y Generar SQL" se ejecuta el análisis, generando el script SQL y extrayendo las entidades (tabla principal y candidatas).

- Los botones de descarga permiten bajar el script SQL y un CSV con la información del análisis.
    Al presionar "Visualizar Diagrama ER" se generan (o refrescan) los nodos y aristas para que el diagrama se muestre en la última Card (usando React Flow).