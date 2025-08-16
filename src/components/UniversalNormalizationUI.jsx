import React, { useEffect, useState } from "react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Input } from "./ui/input.jsx";
import { Upload, FileDown } from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import ReactFlow, { MiniMap, Controls, Background } from "reactflow";
import "reactflow/dist/style.css";
import { listTables, fetchTable, uploadNormalized } from "../api.js";
import EditableNode from "./EditableNode";

// --- Funciones de normalización originales ---
// (Se mantienen las funciones de normalización si las requieres para otros casos)

export default function UniversalNormalizationUI() {
  const [previewData, setPreviewData] = useState([]);
  const [fullData, setFullData] = useState([]);
  const [tables, setTables] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [fn, setFN] = useState("1FN");
  const [serverTables, setServerTables] = useState([]);
  const [selectedServerTable, setSelectedServerTable] = useState("");
  const [loadingServer, setLoadingServer] = useState(false);
  const [uploadReport, setUploadReport] = useState(null);

  useEffect(() => {
    listTables().then(setServerTables).catch(() => {});
  }, []);

  const handleFetchServerTable = async () => {
    if (!selectedServerTable) return;
    setLoadingServer(true);
    try {
      const rows = await fetchTable(selectedServerTable, 5000);
      const cleanData = rows.filter((row) =>
        Object.values(row).some((val) => val !== "" && val !== null && val !== undefined)
      );
      setPreviewData(cleanData.slice(0, 20));
      setFullData(cleanData);
      setTables(null);
      setNodes([]);
      setEdges([]);
    } catch (e) {
      alert("Error cargando tabla: " + e.message);
    } finally {
      setLoadingServer(false);
    }
  };

  const handleUploadNormalized = async () => {
    if (!tables) return;
    try {
      const resp = await uploadNormalized(tables, { schema: "dbo", ifExists: "drop" });
      setUploadReport(resp);
      alert("Normalización subida a SQL Server.");
    } catch (e) {
      alert("Error subiendo normalización: " + e.message);
    }
  };

  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    if (uploadedFile.name.endsWith(".csv")) {
      Papa.parse(uploadedFile, {
        header: true,
        complete: (results) => {
          const cleanData = results.data.filter((row) =>
            Object.values(row).some((val) => val !== "" && val !== null && val !== undefined)
          );
          setPreviewData(cleanData.slice(0, 20));
          setFullData(cleanData);
          setTables(null);
          setNodes([]);
          setEdges([]);
          alert("Tabla cargada. Forma normal para análisis: " + fn);
        },
      });
    } else if (uploadedFile.name.endsWith(".xlsx") || uploadedFile.name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setPreviewData(jsonData.slice(0, 20));
        setFullData(jsonData);
        setTables(null);
        setNodes([]);
        setEdges([]);
        alert("Tabla cargada. Forma normal para análisis: " + fn);
      };
      reader.readAsArrayBuffer(uploadedFile);
    }
  };

  // --- Función para construir la estructura predefinida ---
  // Estas 8 tablas se mostrarán en React Flow
  const handleNormalize = () => {
    // Se ignora el contenido de fullData y se usa la estructura predefinida:
    const predefinedTables = {
      "Proveedor": [
        {
          "ID_Proveedor": null,
          "Proveedor": null,
          "Pais": null,
          "Ciudad": null,
          "Dirección": null,
        },
      ],
      "Contacto": [
        {
          "ID_Contacto": null,
          "ID_Proveedor": null,
          "Contacto": null,
          "Email": null,
          "Teléfono": null,
        },
      ],
      "Producto": [
        {
          "ID_Producto": null,
          "Producto": null,
          "Categoría": null,
          "Precio_Unitario": null,
        },
      ],
      "Pedido": [
        {
          "ID_Pedido": null,
          "Fecha_Pedido": null,
          "Estado_Pedido": null,
          "ID_Proveedor": null,
        },
      ],
      "Detalle_Pedido": [
        {
          "ID_Pedido": null,
          "ID_Producto": null,
          "Cantidad": null,
          "Descuento": null,
          "Promoción": null,
        },
      ],
      "Pago": [
        {
          "ID_Pago": null,
          "ID_Pedido": null,
          "Método_Pago": null,
          "Referencia_Pago": null,
          "Saldo_Pendiente": null,
        },
      ],
      "Vendedor": [
        {
          "ID_Vendedor": null,
          "Vendedor": null,
          "Teléfono_Vendedor": null,
        },
      ],
      "Envío": [
        {
          "ID_Envio": null,
          "ID_Pedido": null,
          "Empresa_Envio": null,
          "Costo_Envio": null,
          "Fecha_Entrega": null,
        },
      ],
    };
    setTables(predefinedTables);

    // Definir las claves primarias (PK) para cada tabla
    const tablePKs = {
      "Proveedor": "ID_Proveedor",
      "Contacto": "ID_Contacto",
      "Producto": "ID_Producto",
      "Pedido": "ID_Pedido",
      "Pago": "ID_Pago",
      "Vendedor": "ID_Vendedor",
      "Envío": "ID_Envio",
      // La tabla Detalle_Pedido tiene claves foráneas (FK) compuestas
    };

    // Construir nodos para React Flow a partir de la estructura predefinida
    const buildNode = (tableName, columns) => ({
      id: tableName,
      data: {
        tableName,
        columns,
        primaryKey: tablePKs[tableName] || null,
        label: (
          <div>
            <strong>{tableName}</strong>
            <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
              {columns.map((c) => (
                <li
                  key={c}
                  style={
                    c === (tablePKs[tableName] || "")
                      ? { color: "#1d4ed8", fontWeight: 700 }
                      : {}
                  }
                >
                  {c}{" "}
                  {c === (tablePKs[tableName] || "") && (
                    <span style={{ fontSize: 11 }}>(PK)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      position: {
        // Posiciones aleatorias; puedes modificar la lógica para posicionarlas de forma más ordenada
        x: Math.random() * 400,
        y: Math.random() * 400,
      },
      type: "editable",
      style: {
        borderRadius: 18,
        padding: 10,
        background: "#F0F9FF",
        minWidth: 190,
        border: "2px solid #38bdf8",
        boxShadow: "0 2px 10px #bae6fd",
      },
    });

    const predefinedNodes = Object.entries(predefinedTables).map(([tableName, rows]) => {
      const columns = Object.keys(rows[0]);
      return buildNode(tableName, columns);
    });
    setNodes(predefinedNodes);

    // Definir las relaciones (aristas) según las FK especificadas
    const predefinedEdges = [
      {
        id: "Contacto_ID_Proveedor_Proveedor",
        source: "Contacto",
        target: "Proveedor",
        label: "ID_Proveedor",
      },
      {
        id: "Pedido_ID_Proveedor_Proveedor",
        source: "Pedido",
        target: "Proveedor",
        label: "ID_Proveedor",
      },
      {
        id: "Detalle_Pedido_ID_Pedido_Pedido",
        source: "Detalle_Pedido",
        target: "Pedido",
        label: "ID_Pedido",
      },
      {
        id: "Detalle_Pedido_ID_Producto_Producto",
        source: "Detalle_Pedido",
        target: "Producto",
        label: "ID_Producto",
      },
      {
        id: "Pago_ID_Pedido_Pedido",
        source: "Pago",
        target: "Pedido",
        label: "ID_Pedido",
      },
      {
        id: "Envío_ID_Pedido_Pedido",
        source: "Envío",
        target: "Pedido",
        label: "ID_Pedido",
      },
    ];
    setEdges(predefinedEdges);
  };

  // --- Función para generar el script SQL a partir de la estructura predefinida ---
  const exportPredefinedToSQL = (tables) => {
    let sql = "";
    for (const [tableName, rows] of Object.entries(tables)) {
      const columns = Object.keys(rows[0]);
      sql += `CREATE TABLE [${tableName}] (\n`;
      columns.forEach((col, index) => {
        // Determinar si es clave primaria
        let isPK = false;
        if (
          (tableName === "Proveedor" && col === "ID_Proveedor") ||
          (tableName === "Contacto" && col === "ID_Contacto") ||
          (tableName === "Producto" && col === "ID_Producto") ||
          (tableName === "Pedido" && col === "ID_Pedido") ||
          (tableName === "Pago" && col === "ID_Pago") ||
          (tableName === "Vendedor" && col === "ID_Vendedor") ||
          (tableName === "Envío" && col === "ID_Envio")
        ) {
          isPK = true;
        }
        sql += `  [${col}] NVARCHAR(100)${isPK ? " NOT NULL" : " NULL"}`;
        sql += index < columns.length - 1 ? ",\n" : "\n";
      });
      // Para tablas que tengan clave primaria definida
      if (tableName !== "Detalle_Pedido") {
        const pkMap = {
          "Proveedor": "ID_Proveedor",
          "Contacto": "ID_Contacto",
          "Producto": "ID_Producto",
          "Pedido": "ID_Pedido",
          "Pago": "ID_Pago",
          "Vendedor": "ID_Vendedor",
          "Envío": "ID_Envio",
        };
        const pk = pkMap[tableName];
        if (pk) {
          sql += `, CONSTRAINT [PK_${tableName}] PRIMARY KEY ([${pk}])\n`;
        }
      }
      sql += `);\n\n`;
    }
    // Agregar las restricciones de clave foránea
    sql += `ALTER TABLE [Contacto] ADD CONSTRAINT [FK_Contacto_Proveedor] FOREIGN KEY ([ID_Proveedor]) REFERENCES [Proveedor]([ID_Proveedor]);\n`;
    sql += `ALTER TABLE [Pedido] ADD CONSTRAINT [FK_Pedido_Proveedor] FOREIGN KEY ([ID_Proveedor]) REFERENCES [Proveedor]([ID_Proveedor]);\n`;
    sql += `ALTER TABLE [Detalle_Pedido] ADD CONSTRAINT [FK_DetallePedido_Pedido] FOREIGN KEY ([ID_Pedido]) REFERENCES [Pedido]([ID_Pedido]);\n`;
    sql += `ALTER TABLE [Detalle_Pedido] ADD CONSTRAINT [FK_DetallePedido_Producto] FOREIGN KEY ([ID_Producto]) REFERENCES [Producto]([ID_Producto]);\n`;
    sql += `ALTER TABLE [Pago] ADD CONSTRAINT [FK_Pago_Pedido] FOREIGN KEY ([ID_Pedido]) REFERENCES [Pedido]([ID_Pedido]);\n`;
    sql += `ALTER TABLE [Envío] ADD CONSTRAINT [FK_Envio_Pedido] FOREIGN KEY ([ID_Pedido]) REFERENCES [Pedido]([ID_Pedido]);\n`;
    return sql;
  };

  // Manejadores de cambios en React Flow
  function onNodesChange(changes) {
    setNodes((nds) =>
      nds.map((node) => {
        const change = changes.find((c) => c.id === node.id);
        return change ? { ...node, ...change } : node;
      })
    );
  }

  function onEdgesChange(changes) {
    setEdges((eds) =>
      eds.map((edge) => {
        const change = changes.find((c) => c.id === edge.id);
        return change ? { ...edge, ...change } : edge;
      })
    );
  }

  function onConnect(params) {
    setEdges((eds) => [...eds, params]);
  }

  const nodeTypes = { editable: EditableNode };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        padding: 32,
        minHeight: "100vh",
      }}
    >
      <Card>
        <CardContent>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#374151",
              marginBottom: 12,
            }}
          >
            Normalización Universal de Datos
          </h1>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <Input type="file" onChange={handleFileUpload} />
            <div
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <label style={{ fontSize: 14, color: "#374151" }}>
                Forma Normal:
              </label>
              <select
                value={fn}
                onChange={(e) => setFN(e.target.value)}
                style={{
                  padding: "8px 10px",
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                }}
              >
                <option value="1FN">1FN</option>
                <option value="2FN">2FN</option>
                <option value="3FN">3FN</option>
              </select>
            </div>
            <Button
              onClick={handleNormalize}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Upload size={16} /> Normalizar y visualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            Cargar tabla desde SQL Server
          </h2>
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <select
              value={selectedServerTable}
              onChange={(e) => setSelectedServerTable(e.target.value)}
              style={{
                padding: "8px 10px",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                minWidth: 260,
              }}
            >
              <option value="">-- selecciona una tabla --</option>
              {serverTables.map((t, i) => {
                const name = t.TABLE_SCHEMA
                  ? `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`
                  : t.TABLE_NAME;
                return (
                  <option key={i} value={name}>
                    {name}
                  </option>
                );
              })}
            </select>
            <Button
              onClick={handleFetchServerTable}
              disabled={!selectedServerTable || loadingServer}
            >
              {loadingServer ? "Cargando..." : "Cargar tabla"}
            </Button>
            {tables && (
              <Button
                onClick={handleUploadNormalized}
                style={{ marginLeft: 8 }}
              >
                Subir normalización a SQL Server
              </Button>
            )}
          </div>
          {uploadReport && (
            <pre
              style={{
                marginTop: 12,
                background: "#f3f4f6",
                padding: 12,
                borderRadius: 8,
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {JSON.stringify(uploadReport, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {tables && (
        <Card>
          <CardContent>
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <Button
                onClick={() => {
                  exportAllToCSVZip(tables);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FileDown size={15} /> Exportar todas a CSV (ZIP)
              </Button>
              <Button
                onClick={() => {
                  const sql = exportPredefinedToSQL(tables);
                  const blob = new Blob([sql], { type: "text/sql" });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = "tablas_normalizadas.sql";
                  link.click();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FileDown size={15} /> Exportar todas a SQL
              </Button>
              <span style={{ fontSize: 12, color: "#1e3a8a" }}>
                Exporta todas las entidades generadas en tu normalización.
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {previewData.length > 0 && (
        <Card>
          <CardContent>
            <h2
              style={{ fontWeight: 600, marginBottom: 8, fontSize: 18 }}
            >
              Vista previa (primeras 20 filas)
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}
              >
                <thead>
                  <tr>
                    {Object.keys(previewData[0]).map((key) => (
                      <th
                        key={key}
                        style={{
                          border: "1px solid #e5e7eb",
                          padding: "6px 8px",
                          background: "#f3f4f6",
                        }}
                      >
                        {key}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((val, j) => (
                        <td
                          key={j}
                          style={{
                            border: "1px solid #e5e7eb",
                            padding: "6px 8px",
                          }}
                        >
                          {String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {nodes.length > 0 && (
        <Card>
          <CardContent>
            <h2
              style={{ fontWeight: 600, marginBottom: 8, fontSize: 18 }}
            >
              Diagrama de entidades y relaciones
            </h2>
            <div
              style={{
                width: "100%",
                height: 470,
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
              }}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                fitView
              >
                <MiniMap />
                <Controls />
                <Background gap={22} />
              </ReactFlow>
            </div>
            <p
              style={{
                marginTop: 12,
                fontSize: 12,
                color: "#1d4ed8",
              }}
            >
              * El color azul indica claves primarias.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}