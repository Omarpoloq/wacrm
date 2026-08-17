import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Bot, BotOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface BotToggleProps {
  conversationId: string;
  botActive: boolean;
  onToggle: (active: boolean) => void;
}

export function BotToggle({ conversationId, botActive, onToggle }: BotToggleProps) {
  const [loading, setLoading] = useState(false);

  const toggle = useCallback(async () => {
    setLoading(true);
    const nextState = !botActive;
    
    // Optimistic update
    onToggle(nextState);

    try {
      const res = await fetch(`/api/conversations/${conversationId}/bot-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_active: nextState }),
      });

      if (!res.ok) throw new Error("Failed to toggle bot");
      
      toast.success(nextState ? "Bot activado" : "Bot pausado");
    } catch (err) {
      console.error(err);
      toast.error("Error al actualizar el estado del bot");
      // Revert
      onToggle(botActive);
    } finally {
      setLoading(false);
    }
  }, [conversationId, botActive, onToggle]);

  return (
    <button
      onClick={toggle}
      disabled={loading}
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        botActive
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-gray-100 text-gray-600 hover:bg-gray-200",
        loading && "opacity-50 cursor-not-allowed"
      )}
    >
      {botActive ? <Bot className="h-3.5 w-3.5" /> : <BotOff className="h-3.5 w-3.5" />}
      {botActive ? "Bot activo" : "Bot pausado"}
    </button>
  );
}
