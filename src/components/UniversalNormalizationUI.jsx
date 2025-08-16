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

// Helpers y funciones de normalización

function getPossiblePrimaryKeys(data) {
  if (!data || data.length === 0) return [];
  const columns = Object.keys(data[0]);
  const pkCandidates = [];
  for (const col of columns) {
    const vals = data.map((row) => row[col]);
    const unique = new Set(
      vals.filter((v) => v !== null && v !== undefined && v !== "")
    ).size;
    if (unique === data.length) pkCandidates.push(col);
  }
  return pkCandidates;
}

function normalize1FN(data) {
  return { Tabla_1FN: data };
}

function normalize2FN(data) {
  const pkCandidates = getPossiblePrimaryKeys(data);
  if (pkCandidates.length < 2) return normalize1FN(data);
  const tables = {};
  pkCandidates.forEach((pk) => {
    const grouped = {};
    data.forEach((row) => {
      if (!grouped[row[pk]]) grouped[row[pk]] = {};
      Object.entries(row).forEach(([k, v]) => {
        if (!(k in grouped[row[pk]])) grouped[row[pk]][k] = v;
      });
    });
    tables[`Entidad_${pk}`] = Object.values(grouped);
  });
  const mainTableCols = Object.keys(data[0]).filter(
    (col) => !pkCandidates.includes(col)
  );
  if (mainTableCols.length > 0) {
    const mainTable = data.map((row) => {
      const obj = {};
      mainTableCols.forEach((col) => (obj[col] = row[col]));
      return obj;
    });
    tables["Relacion_Principal"] = mainTable;
  }
  return tables;
}

function normalize3FN(data) {
  const tables = {};
  const pkCandidates = getPossiblePrimaryKeys(data);
  if (pkCandidates.length > 0) {
    pkCandidates.forEach((pk) => {
      const grouped = {};
      data.forEach((row) => {
        if (!grouped[row[pk]]) grouped[row[pk]] = {};
        Object.entries(row).forEach(([k, v]) => {
          if (!(k in grouped[row[pk]])) grouped[row[pk]][k] = v;
        });
      });
      tables[`Entidad_${pk}`] = Object.values(grouped);
    });
    const usedCols = new Set(pkCandidates);
    Object.values(tables).forEach((rows) =>
      Object.keys(rows[0] || {}).forEach((c) => usedCols.add(c))
    );
    const candidates = Object.keys(data[0]).filter((c) => !usedCols.has(c));
    candidates.forEach((col) => {
      const vals = data.map((r) => r[col]);
      if (new Set(vals).size === data.length)
        tables[`Entidad_${col}`] = data.map((r) => ({ [col]: r[col] }));
    });
    const mainCols = Object.keys(data[0]).filter(
      (c) => !Object.keys(tables).some((tab) => tables[tab][0] && tab.includes(c))
    );
    if (mainCols.length) {
      const mainTable = data.map((row) => {
        const obj = {};
        mainCols.forEach((col) => (obj[col] = row[col]));
        return obj;
      });
      tables["Relacion_Principal"] = mainTable;
    }
    return tables;
  }
  return normalize1FN(data);
}

// Normalización de nombres y tipos (helpers)
function normalizeName(name) {
  return name.trim().replace(/\s+/g, "_");
}

function qualifyTableName(tableName) {
  tableName = normalizeName(tableName);
  if (tableName.indexOf(".") !== -1) return tableName;
  return `dbo.${tableName}`;
}

const typeOverrides = {
  "Fecha de última compra": "DATE",
  "Saldo pendiente": "DECIMAL(18,2)",
};

function getTypeOverride(columnName) {
  return typeOverrides[columnName] ||
    typeOverrides[normalizeName(columnName)] ||
    null;
};

function inferColumnType(values) {
  let allInt = true;
  let allNumeric = true;
  let allDates = true;
  let maxLength = 0;
  let foundValidDate = false;
  const dateRegex = /^(0?[1-9]|[12]\d|3[01])[\/-](0?[1-9]|1[0-2])[\/-](\d{4})$/;
  for (const val of values) {
    if (val === null || val === undefined || String(val).trim() === "") continue;
    const strVal = String(val).trim();
    maxLength = Math.max(maxLength, strVal.length);
    if (dateRegex.test(strVal)) {
      foundValidDate = true;
      continue;
    } else {
      allDates = false;
      const num = Number(strVal);
      if (isNaN(num)) {
        allNumeric = false;
        allInt = false;
      } else {
        if (!Number.isInteger(num)) {
          allInt = false;
        }
      }
    }
  }
  if (foundValidDate && allDates) return "DATETIME";
  if (allNumeric && allInt) return "INT";
  if (allNumeric) return "FLOAT";
  return `NVARCHAR(${Math.max(maxLength, 100)})`;
}

function convertExcelDate(serial) {
  const utcDays = serial - 25569;
  const utcValue = utcDays * 86400 * 1000;
  const date = new Date(utcValue);
  const pad = (n) => (n < 10 ? "0" + n : n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function convertExcelDateOnly(serial) {
  const utcDays = serial - 25569;
  const utcValue = utcDays * 86400 * 1000;
  const date = new Date(utcValue);
  const pad = (n) => (n < 10 ? "0" + n : n);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function getTableKeys(tables) {
  const tablePKs = {};
  for (const [table, rows] of Object.entries(tables)) {
    if (!rows.length) continue;
    let pk = null,
      maxUnique = 0;
    for (const col of Object.keys(rows[0])) {
      const unique = new Set(rows.map((r) => r[col])).size;
      if (unique > maxUnique) {
        pk = col;
        maxUnique = unique;
      }
    }
    if (pk) tablePKs[normalizeName(table)] = normalizeName(pk);
  }
  return tablePKs;
}

function getEdges(tables, tablePKs) {
  const edges = [];
  Object.entries(tables).forEach(([fromTable, rows]) => {
    if (!rows.length) return;
    Object.keys(rows[0]).forEach((col) => {
      Object.entries(tablePKs).forEach(([toTable, pk]) => {
        if (fromTable !== toTable && col === pk) {
          edges.push({
            id: `${fromTable}->${toTable}:${col}`,
            source: fromTable,
            target: toTable,
            label: col,
            animated: true,
            style: { strokeWidth: 2 },
          });
        }
      });
    });
  });
  return edges;
}

function getNodes(tables, tablePKs) {
  const yStep = 200,
    xStep = 380;
  let i = 0;
  return Object.entries(tables).map(([table, rows]) => {
    const columns = rows[0] ? Object.keys(rows[0]) : [];
    return {
      id: table,
      data: {
        tableName: table,
        columns,
        primaryKey: tablePKs[table],
        label: (
          <div>
            <strong>{table}</strong>
            <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
              {columns.map((c) => (
                <li
                  key={c}
                  style={
                    c === tablePKs[table]
                      ? { color: "#1d4ed8", fontWeight: 700 }
                      : {}
                  }
                >
                  {c} {c === tablePKs[table] && <span style={{ fontSize: 11 }}>(PK)</span>}
                </li>
              ))}
            </ul>
          </div>
        ),
      },
      position: { x: (i % 2) * xStep + 80, y: Math.floor(i / 2) * yStep + 60 },
      style: {
        borderRadius: 18,
        padding: 10,
        background: "#F0F9FF",
        minWidth: 190,
        border: "2px solid #38bdf8",
        boxShadow: "0 2px 10px #bae6fd",
      },
      ...(i++, {}),
    };
  });
}

async function exportAllToCSVZip(tables) {
  if (!tables) return;
  const zip = new JSZip();
  Object.entries(tables).forEach(([tableName, data]) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    zip.file(`${tableName}.csv`, csv);
  });
  const content = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(content);
  a.download = "tablas_normalizadas.zip";
  a.click();
}

function exportAllToSQL(tables) {
  if (!tables) return;
  let sql = "";
  let fkSql = "";
  let alterMainTableSql = "";
  const relations = tables.__relations || [];
  Object.entries(tables).forEach(([tableName, data]) => {
    if (tableName === "__relations") return;
    if (!data.length) return;
    const normalizedTableName = normalizeName(tableName);
    const columns = Object.keys(data[0]);
    const normalizedColumns = {};
    columns.forEach((col) => {
      normalizedColumns[col] = normalizeName(col);
    });
    const columnTypes = {};
    columns.forEach((col) => {
      const cleanCol = col.trim();
      columnTypes[normalizedColumns[col]] =
        getTypeOverride(cleanCol) || inferColumnType(data.map((row) => row[col]));
    });
    const qualifiedTableName = qualifyTableName(normalizedTableName);
    sql += `CREATE TABLE [${qualifiedTableName}] (\n`;
    if (normalizedTableName.startsWith("Entity_")) {
      const pkColumn = normalizedColumns[columns[0]];
      sql += `  [${pkColumn}] ${columnTypes[pkColumn]} NOT NULL,\n`;
      sql += `  CONSTRAINT [PK_${normalizedTableName}] PRIMARY KEY ([${pkColumn}])\n`;
    } else if (normalizedTableName === "MainEntity") {
      sql += columns
        .map((col) => {
          const nCol = normalizedColumns[col];
          return `  [${nCol}] ${columnTypes[nCol]}`;
        })
        .join(",\n");
      sql += `\n`;
    } else {
      sql += columns
        .map((col) => `  [${normalizedColumns[col]}] ${columnTypes[normalizedColumns[col]]}`)
        .join(",\n");
      sql += `\n`;
    }
    sql += `);\n\n`;
    data.forEach((row) => {
      const esc = (v) => String(v).replaceAll("'", "''");
      const colNames = columns.map((col) => `[${normalizedColumns[col]}]`).join(",");
      const values = columns
        .map((col) => {
          const nCol = normalizedColumns[col];
          const type = columnTypes[nCol];
          const cell = row[col];
          if (type.startsWith("NVARCHAR")) {
            return `'${esc(cell)}'`;
          } else if (type === "DATETIME" || type === "DATE") {
            if (typeof cell === "number") {
              return type === "DATE"
                ? `'${convertExcelDateOnly(cell)}'`
                : `'${convertExcelDate(cell)}'`;
            } else {
              return `'${esc(cell)}'`;
            }
          } else {
            return `${cell}`;
          }
        })
        .join(",");
      sql += `INSERT INTO [${qualifiedTableName}] (${colNames}) VALUES (${values});\n`;
    });
    sql += `\n`;
  });
  const tablePKs = getTableKeys(tables);
  relations
    .filter((rel) => rel.from === "MainEntity")
    .forEach((rel) => {
      const sourceColumn = normalizeName(rel.column);
      const targetTableName = normalizeName(rel.to);
      const qualifiedTargetTable = qualifyTableName(targetTableName);
      if (!(targetTableName in tablePKs)) return;
      const targetPK = tablePKs[targetTableName];
      const mainVals = tables["MainEntity"].map((row) => row[sourceColumn]);
      const targetVals = tables[rel.to.trim()].map((row) => row[targetPK]);
      const unionVals = [...mainVals, ...targetVals];
      const unifiedType =
        getTypeOverride(sourceColumn) || inferColumnType(unionVals);
      const targetType =
        getTypeOverride(targetPK) || inferColumnType(tables[rel.to.trim()].map((row) => row[targetPK]));
      const currentMainType =
        getTypeOverride(sourceColumn) || inferColumnType(mainVals);
      if (currentMainType !== unifiedType) {
        alterMainTableSql += `ALTER TABLE [${qualifyTableName("MainEntity")}] ALTER COLUMN [${sourceColumn}] ${unifiedType};\n`;
        typeOverrides[normalizeName(sourceColumn)] = unifiedType;
      }
      if (unifiedType === targetType) {
        const constraintName = `FK_MainEntity_${sourceColumn}`;
        fkSql += `ALTER TABLE [${qualifyTableName(
          "MainEntity"
        )}] ADD CONSTRAINT [${constraintName}] FOREIGN KEY ([${sourceColumn}]) REFERENCES [${qualifiedTargetTable}]([${targetPK}]);\n`;
      } else {
        console.warn(
          `No se crea la FK para ${sourceColumn} porque los tipos no se unificaron (${unifiedType} vs ${targetType}).`
        );
      }
    });
  sql += `\n${alterMainTableSql}\n${fkSql}`;
  const blob = new Blob([sql], { type: "text/sql" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "tablas_normalizadas.sql";
  link.click();
}

function advancedNormalize(data) {
  if (!data || data.length === 0) return {};
  const cleanData = data.map((row) => {
    const newRow = {};
    Object.keys(row).forEach((k) => {
      newRow[k.trim()] = row[k];
    });
    return newRow;
  });
  const entities = { MainEntity: cleanData };
  const candidatePKs = Object.keys(cleanData[0]).filter((col) => {
    const uniqueCount = new Set(cleanData.map((row) => row[col])).size;
    return uniqueCount === cleanData.length;
  });
  candidatePKs.forEach((col) => {
    entities[`Entity_${col}`] = cleanData.map((row) => ({ [col]: row[col] }));
  });
  const foreignKeys = [];
  Object.keys(cleanData[0]).forEach((col) => {
    if (candidatePKs.includes(col)) {
      foreignKeys.push({
        from: "MainEntity",
        column: col,
        to: `Entity_${col}`,
      });
    } else {
      candidatePKs.forEach((pk) => {
        const candidateValues = new Set(cleanData.map((row) => row[pk]));
        const colValues = new Set(cleanData.map((row) => row[col]));
        const allMatch = [...colValues].every((val) => candidateValues.has(val));
        if (allMatch) {
          foreignKeys.push({
            from: "MainEntity",
            column: col,
            to: `Entity_${pk}`,
          });
        }
      });
    }
  });
  entities.__relations = foreignKeys;
  return entities;
}

function updateNodeLabel(id, newLabel, setNodes) {
  setNodes((nds) =>
    nds.map((node) => {
      if (node.id === id) {
        return {
          ...node,
          data: {
            ...node.data,
            tableName: newLabel,
            label: (
              <div>
                <strong>{newLabel}</strong>
                <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
                  {node.data.columns.map((c) => (
                    <li
                      key={c}
                      style={
                        c === node.data.primaryKey
                          ? { color: "#1d4ed8", fontWeight: 700 }
                          : {}
                      }
                    >
                      {c} {c === node.data.primaryKey && <span style={{ fontSize: 11 }}>(PK)</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          },
        };
      }
      return node;
    })
  );
}

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
      };
      reader.readAsArrayBuffer(uploadedFile);
    }
  };

  const handleNormalize = () => {
    if (!fullData.length) return;
    let _tables;
    if (fn === "1FN") {
      _tables = normalize1FN(fullData);
    } else if (fn === "2FN") {
      _tables = normalize2FN(fullData);
    } else if (fn === "3FN") {
      _tables = normalize3FN(fullData);
    } else {
      _tables = normalize1FN(fullData);
    }
    // Para el diagrama se usa advancedNormalize
    _tables = advancedNormalize(fullData);
    setTables(_tables);
    const tablePKs = getTableKeys(_tables);
    const normalizedNodes = getNodes(_tables, tablePKs).map((node) => ({
      ...node,
      type: "editable",
      data: {
        ...node.data,
        onLabelChange: (id, newLabel) => updateNodeLabel(id, newLabel, setNodes),
      },
    }));
    setNodes(normalizedNodes);
    setEdges(getEdges(_tables, tablePKs));
  };

  // Callbacks para React Flow
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#374151", marginBottom: 12 }}>
            Normalización Universal de Datos
          </h1>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Input type="file" onChange={handleFileUpload} />
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 14, color: "#374151" }}>Forma Normal:</label>
              <select
                value={fn}
                onChange={(e) => setFN(e.target.value)}
                style={{ padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 10 }}
              >
                <option value="1FN">1FN</option>
                <option value="2FN">2FN</option>
                <option value="3FN">3FN</option>
              </select>
            </div>
            <Button 
              onClick={handleNormalize} 
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Upload size={16} /> Normalizar y visualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Cargar tabla desde SQL Server</h2>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
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
                const name = t.TABLE_SCHEMA ? `${t.TABLE_SCHEMA}.${t.TABLE_NAME}` : t.TABLE_NAME;
                return (
                  <option key={i} value={name}>
                    {name}
                  </option>
                );
              })}
            </select>
            <Button onClick={handleFetchServerTable} disabled={!selectedServerTable || loadingServer}>
              {loadingServer ? "Cargando..." : "Cargar tabla"}
            </Button>
            {tables && (
              <Button onClick={handleUploadNormalized} style={{ marginLeft: 8 }}>
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
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Button
                onClick={() => exportAllToCSVZip(tables)}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <FileDown size={15} /> Exportar todas a CSV (ZIP)
              </Button>
              <Button
                onClick={() => {
                  console.log("tables:", tables);
                  exportAllToSQL(tables);
                }}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
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
            <h2 style={{ fontWeight: 600, marginBottom: 8, fontSize: 18 }}>
              Vista previa (primeras 20 filas)
            </h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {Object.keys(previewData[0]).map((key) => (
                      <th
                        key={key}
                        style={{ border: "1px solid #e5e7eb", padding: "6px 8px", background: "#f3f4f6" }}
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
                        <td key={j} style={{ border: "1px solid #e5e7eb", padding: "6px 8px" }}>
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
            <h2 style={{ fontWeight: 600, marginBottom: 8, fontSize: 18 }}>
              Diagrama de entidades y relaciones
            </h2>
            <div style={{ width: "100%", height: 470, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12 }}>
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
            <p style={{ marginTop: 12, fontSize: 12, color: "#1d4ed8" }}>
              * El color azul indica claves primarias detectadas automáticamente.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}