"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  RefreshCw,
  ClipboardList,
  Package,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useSupplies,
  useDeleteSupply,
  type Supply,
} from "@/lib/queries/supplies";
import { SupplyFormSheet } from "@/components/dashboard/supplies/supply-form-sheet";
import { RestockDialog } from "@/components/dashboard/supplies/restock-dialog";
import { LogUsageSheet } from "@/components/dashboard/supplies/log-usage-sheet";

import { useSupplyLogs } from "@/lib/queries/supplies";
import { History } from "lucide-react";
import { format } from "date-fns";
const UNIT_SHORT: Record<string, string> = {
  ml: "ml",
  l: "L",
  g: "g",
  kg: "kg",
  pieces: "pcs",
  bottles: "btl",
  boxes: "box",
  other: "",
};

export default function SuppliesPage() {
  const { data: supplies, isLoading } = useSupplies();
  const deleteSupply = useDeleteSupply();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupply, setEditingSupply] = useState<Supply | null>(null);
  const [restockSupply, setRestockSupply] = useState<Supply | null>(null);
  const [deletingSupply, setDeletingSupply] = useState<Supply | null>(null);
  const [logUsageOpen, setLogUsageOpen] = useState(false);

  // supply logs stats
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: logs } = useSupplyLogs();

  const lowStockCount = supplies?.filter((s) => s.is_low_stock).length ?? 0;

  const filteredSupplies = useMemo(() => {
    if (!supplies) return [];
    const q = search.trim().toLowerCase();
    if (!q) return supplies;
    return supplies.filter((s) => s.name.toLowerCase().includes(q));
  }, [supplies, search]);

  const openAdd = () => {
    setEditingSupply(null);
    setFormOpen(true);
  };

  const openEdit = (supply: Supply) => {
    setEditingSupply(supply);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deletingSupply) {
      deleteSupply.mutate(deletingSupply.id);
      setDeletingSupply(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplies</h1>
          <p className="text-gray-500 text-sm mt-1">
            {supplies?.length ?? 0} items in inventory
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLogUsageOpen(true)}>
            <ClipboardList className="w-4 h-4 mr-1.5" />
            Log Usage
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setHistoryOpen(true)}>
              <History className="w-4 h-4 mr-1.5" />
              History
            </Button>
            <Button variant="outline" onClick={() => setLogUsageOpen(true)}>
              <ClipboardList className="w-4 h-4 mr-1.5" />
              Log Usage
            </Button>
            <Button onClick={openAdd}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Supply
            </Button>
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Supply
          </Button>
        </div>
      </div>

      {/* Low stock alert */}
      {lowStockCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              {lowStockCount} item{lowStockCount > 1 ? "s" : ""} running low
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Restock before your next round of jobs
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search supplies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4"
            >
              <Skeleton className="w-10 h-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && supplies?.length === 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-blue-600" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-1">No supplies yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Add your first supply to start tracking inventory
          </p>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Supply
          </Button>
        </div>
      )}

      {/* No search results */}
      {!isLoading &&
        supplies &&
        supplies.length > 0 &&
        filteredSupplies.length === 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <p className="text-gray-500 text-sm">
              No supplies match &ldquo;{search}&rdquo;
            </p>
          </div>
        )}

      {/* Supply list */}
      {!isLoading && filteredSupplies.length > 0 && (
        <div className="space-y-3">
          {filteredSupplies.map((supply) => {
            const unit = UNIT_SHORT[supply.unit] || supply.unit;
            const stockPercent =
              supply.minimum_quantity > 0
                ? (supply.current_quantity / supply.minimum_quantity) * 100
                : 100;

            return (
              <div
                key={supply.id}
                className={`bg-white border rounded-xl p-4 flex items-center gap-4 transition-colors ${
                  supply.is_low_stock
                    ? "border-amber-200 bg-amber-50/30"
                    : "border-gray-100 hover:border-gray-200"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    supply.is_low_stock ? "bg-amber-100" : "bg-blue-50"
                  }`}
                >
                  <Package
                    className={`w-5 h-5 ${
                      supply.is_low_stock ? "text-amber-600" : "text-blue-600"
                    }`}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900 truncate">
                      {supply.name}
                    </p>
                    {supply.is_low_stock && (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 text-xs"
                      >
                        Low stock
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    <span>
                      <span
                        className={`font-semibold ${
                          supply.is_low_stock
                            ? "text-amber-700"
                            : "text-gray-900"
                        }`}
                      >
                        {supply.current_quantity}
                      </span>{" "}
                      / {supply.minimum_quantity} {unit} (min)
                    </span>
                    {supply.cost_per_unit && (
                      <span>
                        ${supply.cost_per_unit.toFixed(2)}/{unit}
                      </span>
                    )}
                  </div>

                  {/* Stock bar */}
                  <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden w-full max-w-[200px]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        stockPercent <= 100 ? "bg-amber-400" : "bg-blue-500"
                      }`}
                      style={{
                        width: `${Math.min(stockPercent, 100)}%`,
                      }}
                    />
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(supply)}>
                      <Pencil className="w-4 h-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setRestockSupply(supply)}>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Restock
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeletingSupply(supply)}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      {/* Sheets and dialogs */}
      <SupplyFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        supply={editingSupply}
      />

      <RestockDialog
        open={!!restockSupply}
        onOpenChange={(o) => !o && setRestockSupply(null)}
        supply={restockSupply}
      />

      <LogUsageSheet open={logUsageOpen} onOpenChange={setLogUsageOpen} />

      <AlertDialog
        open={!!deletingSupply}
        onOpenChange={(o) => !o && setDeletingSupply(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this supply?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingSupply?.name} will be removed from your inventory.
              Existing usage logs will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Supply Log History Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Supply Usage History</SheetTitle>
          </SheetHeader>
          <div className="px-4 space-y-3">
            {!logs || logs.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No usage logged yet</p>
              </div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-gray-50 rounded-xl p-4 flex items-start gap-3"
                >
                  <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Package className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {(log.supply as any)?.name ?? "Unknown supply"}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {log.quantity} {(log.supply as any)?.unit} used ·{" "}
                      {(log.job as any)?.title ?? "Unknown job"}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(log.created_at), "MMM d, yyyy h:mm a")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
