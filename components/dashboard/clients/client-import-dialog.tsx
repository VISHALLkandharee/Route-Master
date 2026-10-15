"use client";

import { useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_CLIENT_IMPORT_BYTES,
  MAX_CLIENT_IMPORT_ROWS,
  parseClientCsv,
  type ClientCsvRow,
} from "@/lib/client-csv";
import { useImportClients } from "@/lib/queries/clients";

interface ClientImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE =
  "full_name,phone,address,email,service_type,preferred_contact,notes\n" +
  'Jordan Lee,+15551234567,"125 Main St, Springfield, IL 62701",jordan@example.com,pool_cleaning,none,"Gate code: 1234"\n';

export function ClientImportDialog({ open, onOpenChange }: ClientImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ClientCsvRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState("");
  const importClients = useImportClients();
  const validClients = rows.flatMap((row) => (row.client ? [row.client] : []));
  const invalidCount = rows.length - validClients.length;

  const reset = () => {
    setRows([]);
    setFileName("");
    setFileError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && importClients.isPending) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "routemaster-clients-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file?: File) => {
    reset();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setFileError("Choose a .csv file.");
      return;
    }
    if (file.size > MAX_CLIENT_IMPORT_BYTES) {
      setFileError("This file is too large. Choose a CSV under 1 MB.");
      return;
    }

    try {
      const parsedRows = parseClientCsv(await file.text());
      setRows(parsedRows);
      setFileName(file.name);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read this CSV file.");
    }
  };

  const handleImport = async () => {
    if (validClients.length === 0) return;
    try {
      await importClients.mutateAsync(validClients);
      handleOpenChange(false);
    } catch {
      // The mutation displays a safe user-facing error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import your clients</DialogTitle>
          <DialogDescription>
            Bring your existing client list into Routemaster, then schedule jobs and build a route.
            Import up to {MAX_CLIENT_IMPORT_ROWS} clients at a time.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
          <p className="text-sm font-medium text-gray-900">Prepare your CSV</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600">
            Required columns: <code>full_name</code>, <code>phone</code>, and <code>address</code>.
            Optional columns: email, service_type, preferred_contact, and notes. Contact preference
            defaults to <code>none</code>; only choose SMS when you have the client’s permission.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Download CSV template
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          aria-label="Choose client CSV file"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => inputRef.current?.click()}
          disabled={importClients.isPending}
        >
          <Upload className="mr-2 h-4 w-4" />
          {fileName || "Choose a CSV file"}
        </Button>
        {fileError && <p role="alert" className="text-sm text-red-600">{fileError}</p>}

        {rows.length > 0 && (
          <section aria-live="polite" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 font-medium text-gray-900">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" />
                {rows.length} row{rows.length === 1 ? "" : "s"} found
              </span>
              <span className="text-gray-600">
                {validClients.length} ready{invalidCount ? ` · ${invalidCount} need${invalidCount === 1 ? 's' : ''} correction` : ""}
              </span>
            </div>
            <div className="max-h-48 overflow-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2">Row</th>
                    <th className="p-2">Client</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((row) => (
                    <tr key={row.rowNumber} className="border-t align-top">
                      <td className="p-2 text-gray-500">{row.rowNumber}</td>
                      <td className="p-2">{row.client?.full_name ?? "—"}</td>
                      <td className="p-2">{row.client?.phone ?? "—"}</td>
                      <td className={`p-2 ${row.errors.length ? "text-red-600" : "text-green-700"}`}>
                        {row.errors.length ? row.errors.join("; ") : "Ready"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && (
                <p className="border-t bg-gray-50 p-2 text-xs text-gray-500">
                  Showing first 20 rows. All {rows.length} rows will be checked before import.
                </p>
              )}
            </div>
            {invalidCount > 0 && (
              <p className="text-xs text-amber-700">
                Valid rows can be imported now; rows with errors will be left out. Correct those rows and import them later.
              </p>
            )}
          </section>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={importClients.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleImport()} disabled={validClients.length === 0 || importClients.isPending}>
            {importClients.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {importClients.isPending ? "Importing…" : `Import ${validClients.length} clients`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
