"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Phone,
  MapPin,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  useClients,
  useDeleteClient,
  type Client,
} from "@/lib/queries/clients";
import { ClientFormSheet } from "@/components/dashboard/clients/client-form-sheet";
import { PageTransition } from "@/components/dashboard/page-transition";

const SERVICE_TYPE_LABELS: Record<string, string> = {
  pet_grooming: "Pet Grooming",
  pool_cleaning: "Pool Cleaning",
  auto_detailing: "Auto Detailing",
  other: "Other",
};

const SERVICE_TYPE_COLORS: Record<string, string> = {
  pet_grooming: "bg-pink-50 text-pink-700 border-pink-200",
  pool_cleaning: "bg-blue-50 text-blue-700 border-blue-200",
  auto_detailing: "bg-purple-50 text-purple-700 border-purple-200",
  other: "bg-gray-50 text-gray-700 border-gray-200",
};

export default function ClientsPage() {
  const { data: clients, isLoading } = useClients();
  const deleteClient = useDeleteClient();

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deletingClient, setDeletingClient] = useState<Client | null>(null);

  const filteredClients = useMemo(() => {
    if (!clients) return [];
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.address.toLowerCase().includes(q),
    );
  }, [clients, search]);

  const openAddSheet = () => {
    setEditingClient(null);
    setFormOpen(true);
  };

  const openEditSheet = (client: Client) => {
    setEditingClient(client);
    setFormOpen(true);
  };

  const confirmDelete = () => {
    if (deletingClient) {
      deleteClient.mutate(deletingClient.id);
      setDeletingClient(null);
    }
  };

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
            <p className="text-gray-500 text-sm mt-1">
              {clients?.length ?? 0} total clients
            </p>
          </div>
          <Button onClick={openAddSheet}>
            <Plus className="w-4 h-4 mr-1.5" />
            Add Client
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search clients by name, phone, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4"
              >
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && clients?.length === 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-blue-600" />
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No clients yet</h3>
            <p className="text-gray-500 text-sm mb-4">
              Add your first client to start scheduling jobs
            </p>
            <Button onClick={openAddSheet}>
              <Plus className="w-4 h-4 mr-1.5" />
              Add Client
            </Button>
          </div>
        )}

        {/* No Search Results */}
        {!isLoading &&
          clients &&
          clients.length > 0 &&
          filteredClients.length === 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-10 text-center">
              <p className="text-gray-500 text-sm">
                No clients match &ldquo;{search}&rdquo;
              </p>
            </div>
          )}

        {/* Client List */}
        {!isLoading && filteredClients.length > 0 && (
          <div className="space-y-3">
            {filteredClients.map((client) => {
              const initials = client.full_name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")
                .toUpperCase();

              return (
                <div
                  key={client.id}
                  className="bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 hover:border-gray-200 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">
                        {client.full_name}
                      </p>
                      <Badge
                        variant="outline"
                        className={SERVICE_TYPE_COLORS[client.service_type]}
                      >
                        {SERVICE_TYPE_LABELS[client.service_type]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {client.phone}
                      </span>
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{client.address}</span>
                      </span>
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
                      <DropdownMenuItem onClick={() => openEditSheet(client)}>
                        <Pencil className="w-4 h-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeletingClient(client)}
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

        <ClientFormSheet
          open={formOpen}
          onOpenChange={setFormOpen}
          client={editingClient}
        />

        <AlertDialog
          open={!!deletingClient}
          onOpenChange={(open) => !open && setDeletingClient(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this client?</AlertDialogTitle>
              <AlertDialogDescription>
                {deletingClient?.full_name} will be removed from your client
                list. Their job history will be preserved.
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
      </div>
    </PageTransition>
  );
}
