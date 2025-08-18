import React, { useState } from "react";
import { Button } from "./ui/button.jsx";
import { Card, CardContent } from "./ui/card.jsx";
import { Input } from "./ui/input.jsx";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ReactFlow, { MiniMap, Controls, Background } from "reactflow";
import "reactflow/dist/style.css";

// =======================
// UTILIDADES PARA 3FN
// =======================
const CLEAN_SPLIT = /[,;|/]+/;
const toSQLName = (s = "") =>
  s.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^\d/, "x");

const isInt = (v) => /^-?\d+$/.test(String(v ?? "").trim());
const isNum = (v) => /^-?\d+(\.\d+)?$/.test(String(v ?? "").trim());
const isBool = (v) =>
  ["true", "false", "0", "1", "si", "no", "yes", "y", "n"].includes(
    String(v ?? "").trim().toLowerCase()
  );
const isDate = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{2}\/\d{2}\/\d{4}$/.test(s))
    return true;
  const d = new Date(s);
  return !isNaN(d.getTime());
};

const inferSqlType = (values = []) => {
  let allInt = true,
    allNum = true,
    allDate = true,
    allBool = true,
    maxLen = 0;
  for (const raw of values) {
    const v = raw == null ? "" : String(raw).trim();
    maxLen = Math.max(maxLen, v.length);
    if (!isInt(v)) allInt = false;
    if (!isNum(v)) allNum = false;
    if (!isDate(v)) allDate = false;
    if (!isBool(v)) allBool = false;
  }
  if (allBool) return "BIT";
  if (allInt) return "INT";
  if (allNum) return "DECIMAL(18,6)";
  if (allDate) return "DATETIME2";
  const size = Math.min(Math.max(50, Math.ceil(maxLen / 10) * 10), 4000);
  return `NVARCHAR(${size})`;
};

const normalize1FNRows = (rows) => {
  let output = [];
  let rowIndex = 0;
  for (const row of rows) {
    const maxSplit = Math.max(
      ...Object.values(row).map((v) =>
        typeof v === "string" && v.includes(",") ? v.split(",").length : 1
      )
    );
    if (maxSplit === 1) {
      output.push({ ...row, __origenID: `row_${rowIndex}` });
    } else {
      for (let i = 0; i < maxSplit; i++) {
        const newRow = { __origenID: `row_${rowIndex}` };
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === "string" && v.includes(",")) {
            const parts = v.split(",").map((s) => s.trim());
            newRow[k] = parts[i] ?? null;
          } else {
            newRow[k] = v;
          }
        }
        output.push(newRow);
      }
    }
    rowIndex++;
  }
  return output;
};

// =======================
// FUNCIONES DE ANALISIS Y GENERACION DE SQL
// =======================
const analyzeDependencies = (data) => {
  if (!data || !data.length) return { mainTable: null, candidateEntities: [] };

  const THRESHOLD = 20;
  const allColumns = Object.keys(data[0]);
  let mainTableColumns = [...allColumns];
  const candidateEntities = [];

  allColumns.forEach((col) => {
    const distinctCount = new Set(data.map((row) => row[col])).size;
    if (distinctCount < THRESHOLD) {
      const pkName = `ID_${col.toUpperCase()}`;
      candidateEntities.push({
        tableName: `Entidad_${toSQLName(col)}`,
        primaryKey: pkName,
        columns: [pkName, col],
        types: {
          [pkName]: "NVARCHAR(100)",
          [col]: inferSqlType(data.map((row) => row[col])),
        },
        foreignKeys: []
      });
      mainTableColumns = mainTableColumns.filter((c) => c !== col);
    }
  });

  const mainTable = {
    tableName: "Tabla_Principal",
    primaryKey: "ID_Main",
    columns: ["ID_Main", ...mainTableColumns, ...candidateEntities.map(ent => ent.primaryKey)],
    foreignKeys: candidateEntities.map((ent) => ({
      foreignKey: ent.primaryKey,
      referencedTable: ent.tableName,
      referencedField: ent.primaryKey,
    })),
    types: {}
  };

  mainTable.types["ID_Main"] = "NVARCHAR(100)";
  mainTableColumns.forEach((col) => {
    mainTable.types[toSQLName(col)] = inferSqlType(data.map((row) => row[col]));
  });
  candidateEntities.forEach((ent) => {
    mainTable.types[ent.primaryKey] = "NVARCHAR(100)";
  });

  return { mainTable, candidateEntities };
};

const generateSqlFromAnalysis = (analysis) => {
  const { mainTable, candidateEntities } = analysis;
  const createDatabase = `CREATE DATABASE ProyectoNormalizacion;\n\nUSE ProyectoNormalizacion;\n\n`;

  const mainTableColumnsScript = mainTable.columns
    .map(
      (col) =>
        `  [${col}] ${mainTable.types[col] || "NVARCHAR(100)"} ${
          col === mainTable.primaryKey ? "NOT NULL" : "NULL"
        }`
    )
    .join(",\n");
  const mainPkScript = `  CONSTRAINT [PK_${toSQLName(
    mainTable.tableName
  )}] PRIMARY KEY ([${mainTable.primaryKey}])`;
  const mainTableScript = `CREATE TABLE [${toSQLName(
    mainTable.tableName
  )}] (\n${mainTableColumnsScript},\n${mainPkScript}\n);`;

  const mainFkScripts = mainTable.foreignKeys
    .map(
      (fk) =>
        `ALTER TABLE [${toSQLName(
          mainTable.tableName
        )}] ADD CONSTRAINT [FK_${toSQLName(
          mainTable.tableName
        )}_${toSQLName(fk.foreignKey)}] FOREIGN KEY ([${fk.foreignKey}]) REFERENCES [${toSQLName(
          fk.referencedTable
        )}] ([${toSQLName(fk.referencedField)}]);`
    )
    .join("\n");

  const candidateScripts = candidateEntities
    .map((entity) => {
      const columnsScript = entity.columns
        .map(
          (col) =>
            `  [${toSQLName(col)}] ${entity.types[col] || "NVARCHAR(100)"} ${
              col === entity.primaryKey ? "NOT NULL" : "NULL"
            }`
        )
        .join(",\n");
      const pkScript = `  CONSTRAINT [PK_${toSQLName(
        entity.tableName
      )}] PRIMARY KEY ([${toSQLName(entity.primaryKey)}])`;
      return `CREATE TABLE [${toSQLName(entity.tableName)}] (\n${columnsScript},\n${pkScript}\n);`;
    })
    .join("\n\n");

  return createDatabase + mainTableScript + "\n\n" + mainFkScripts + "\n\n" + candidateScripts;
};

const generateCSVFromAnalysis = (analysis) => {
  const { mainTable, candidateEntities } = analysis;
  const rows = [];
  rows.push(["Table", "PrimaryKey", "Columns", "ForeignKeys"]);
  rows.push([
    mainTable.tableName,
    mainTable.primaryKey,
    mainTable.columns.join(" | "),
    mainTable.foreignKeys
      .map(
        (fk) =>
          `${fk.foreignKey} -> ${fk.referencedTable}(${fk.referencedField})`
      )
      .join(" | ")
  ]);
  candidateEntities.forEach((ent) => {
    rows.push([
      ent.tableName,
      ent.primaryKey,
      ent.columns.join(" | "),
      ""
    ]);
  });
  return rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
};

const downloadFile = (data, filename, type) => {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const downloadSQL = (sqlScript) => {
  downloadFile(sqlScript, "script.sql", "text/sql");
};

const downloadCSV = (csvData) => {
  downloadFile(csvData, "analysis.csv", "text/csv");
};

// =======================
// ER PARA REACT FLOW
// =======================
const createERDiagram = (analysis) => {
  const buildNodeBySchema = (t) => ({
    id: t.tableName,
    data: {
      tableName: t.tableName,
      columns: t.columns,
      primaryKey: t.primaryKey,
      foreignKeys: t.foreignKeys || [],
      label: (
        <div>
          <strong>{t.tableName}</strong>
          <p style={{ fontSize: 12, margin: "4px 0" }}>
            PK: {Array.isArray(t.primaryKey) ? t.primaryKey.join(", ") : t.primaryKey}
          </p>
          {t.foreignKeys?.length ? (
            <p style={{ fontSize: 12, margin: "4px 0" }}>
              FK: {t.foreignKeys.map(f => f.foreignKey).join(", ")}
            </p>
          ) : null}
          <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
            {t.columns.map(c => (<li key={c}>{c}</li>))}
          </ul>
        </div>
      ),
    },
    position: { x: Math.random() * 500, y: Math.random() * 400 },
    type: "editable",
    style: {
      borderRadius: 18,
      padding: 10,
      background: "#F0F9FF",
      minWidth: 220,
      border: "2px solid #38bdf8",
      boxShadow: "0 2px 10px #bae6fd",
    },
  });
  const nodes = [
    buildNodeBySchema(analysis.mainTable),
    ...analysis.candidateEntities.map(buildNodeBySchema)
  ];
  const edges = [];
  const addEdges = (t) => {
    for (const fk of t.foreignKeys || []) {
      edges.push({
        id: `edge_${t.tableName}_${fk.referencedTable}_${fk.foreignKey}`,
        source: t.tableName,
        target: fk.referencedTable,
        label: `FK ${fk.foreignKey} → ${fk.referencedTable}(${fk.referencedField})`
      });
    }
  };
  addEdges(analysis.mainTable);
  analysis.candidateEntities.forEach(addEdges);
  // Devuelve el título junto con nodos y aristas
  return { title: "Diagrama Entidad-Relación", nodes, edges };
};

// =======================
// COMPONENTE PRINCIPAL
// =======================
export default function UniversalNormalizationUI() {
  const [data, setData] = useState([]);
  const [sqlScript, setSqlScript] = useState("");
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [diagramTitle, setDiagramTitle] = useState("");

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.name.endsWith(".csv")) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const cleanData = results.data.filter((row) =>
            Object.values(row).some((val) => val !== "" && val != null)
          );
          const normalized = normalize1FNRows(cleanData);
          setData(normalized);
        },
      });
    } else if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        const cleanData = jsonData.filter((row) =>
          Object.values(row).some((val) => val !== "" && val != null)
        );
        const normalized = normalize1FNRows(cleanData);
        setData(normalized);
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert("Por favor, sube un archivo CSV o Excel.");
    }
  };

  const handleAnalyze = () => {
    if (!data.length) {
      alert("No se ha cargado data.");
      return;
    }
    setAlertMsg("Los datos insertados fueron transformados a 3FN.");
    const analysis = analyzeDependencies(data);
    setAnalysisResult(analysis);
    const sql = generateSqlFromAnalysis(analysis);
    setSqlScript(sql);
    const allEntities = [analysis.mainTable, ...analysis.candidateEntities];
    setNodes(generateReactFlowNodesFromEntities(allEntities));
    setEdges(generateReactFlowEdgesFromEntities(allEntities));
  };

  const handleVisualizeER = () => {
    if (analysisResult) {
      const diagram = createERDiagram(analysisResult);
      setNodes(diagram.nodes);
      setEdges(diagram.edges);
      setDiagramTitle(diagram.title);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1
        style={{
          textAlign: "center",
          fontWeight: "bold",
          marginBottom: 24,
          color: "#1976d2",
        }}
      >
        PROYECTO NORMALIZACION ADB2 GRUPO#3
      </h1>
      <Card>
        <CardContent>
          <h2>Normalización Universal</h2>
          <Input type="file" onChange={handleFileUpload} />
          <Button onClick={handleAnalyze}>Analizar y Generar SQL</Button>
        </CardContent>
      </Card>
      {alertMsg && (
        <Card style={{ marginTop: 24, background: "#e3f2fd" }}>
          <CardContent>
            <p style={{ textAlign: "center", fontWeight: "bold" }}>
              {alertMsg}
            </p>
          </CardContent>
        </Card>
      )}
      {sqlScript && (
        <Card style={{ marginTop: 24 }}>
          <CardContent>
            <h3>Script SQL Generado</h3>
            <pre
              style={{
                overflowX: "auto",
                background: "#f4f4f4",
                padding: 12,
              }}
            >
              {sqlScript}
            </pre>
            <div style={{ marginTop: 12 }}>
              <Button onClick={() => downloadSQL(sqlScript)}>
                Descargar Script SQL
              </Button>
              {analysisResult && (
                <>
                  <Button
                    style={{ marginLeft: 12 }}
                    onClick={() => {
                      const csv = generateCSVFromAnalysis(analysisResult);
                      downloadCSV(csv);
                    }}
                  >
                    Descargar CSV
                  </Button>
                  <Button
                    style={{ marginLeft: 12 }}
                    onClick={handleVisualizeER}
                  >
                    Visualizar Diagrama ER
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      {data.length > 0 && (
        <Card style={{ marginTop: 24 }}>
          <CardContent>
            <h3
              style={{
                textAlign: "center",
                marginBottom: 12,
              }}
            >
              Vista Previa del Archivo Subido
            </h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {Object.keys(data[0]).map((header, index) => (
                      <th
                        key={index}
                        style={{
                          border: "1px solid #ddd",
                          padding: "8px",
                          backgroundColor: "#f2f2f2",
                        }}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((cell, j) => (
                        <td
                          key={j}
                          style={{
                            border: "1px solid #ddd",
                            padding: "8px",
                          }}
                        >
                          {cell ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ fontSize: 12, marginTop: 8 }}>
              Mostrando las primeras 10 filas
            </p>
          </CardContent>
        </Card>
      )}
      {nodes.length > 0 && (
        <Card style={{ marginTop: 24, height: 500 }}>
          <CardContent>
            <h3 style={{ textAlign: "center", marginBottom: 12 }}>{diagramTitle}</h3>
            <ReactFlow nodes={nodes} edges={edges} fitView>
              <MiniMap />
              <Controls />
              <Background gap={16} />
            </ReactFlow>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

