"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRestockSupply, type Supply } from "@/lib/queries/supplies";

interface RestockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supply: Supply | null;
}

export function RestockDialog({
  open,
  onOpenChange,
  supply,
}: RestockDialogProps) {
  const [amount, setAmount] = useState("");
  const restock = useRestockSupply();

  const handleRestock = () => {
    if (!supply || !amount || Number(amount) <= 0) return;

    restock.mutate(
      {
        id: supply.id,
        addQuantity: Number(amount),
        currentQuantity: supply.current_quantity,
      },
      {
        onSuccess: () => {
          setAmount("");
          onOpenChange(false);
        },
      },
    );
  };

  if (!supply) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setAmount("");
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Restock — {supply.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm">
            <span className="text-gray-500">Current stock: </span>
            <span className="font-semibold text-gray-900">
              {supply.current_quantity} {supply.unit}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="restock_amount">
              How much are you adding? ({supply.unit})
            </Label>
            <Input
              id="restock_amount"
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>

          {amount && Number(amount) > 0 && (
            <p className="text-xs text-gray-500">
              New total:{" "}
              <span className="font-semibold text-green-700">
                {(supply.current_quantity + Number(amount)).toFixed(2)}{" "}
                {supply.unit}
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={restock.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleRestock}
            disabled={!amount || Number(amount) <= 0 || restock.isPending}
          >
            {restock.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Restocking...
              </>
            ) : (
              "Confirm Restock"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
