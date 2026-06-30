import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/components/app-ui";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/sua/pagos")({
  component: () => (
    <EmptyState
      icon={Wallet}
      title="Pagos SIPARE (Fase C)"
      description="Historial de pagos con línea de captura y comprobantes. Esto se construye después del módulo de bimestres."
    />
  ),
});
