import { cn } from "@/lib/utils";

interface FunnelStageBadgeProps {
  stage: string;
}

export function FunnelStageBadge({ stage }: FunnelStageBadgeProps) {
  const normalizedStage = stage.toLowerCase();
  
  const getColors = () => {
    switch (normalizedStage) {
      case "nuevo": return "bg-gray-100 text-gray-700";
      case "contactado": return "bg-blue-100 text-blue-700";
      case "calificado": return "bg-yellow-100 text-yellow-700";
      case "propuesta": return "bg-orange-100 text-orange-700";
      case "cerrado": return "bg-green-100 text-green-700";
      case "perdido": return "bg-red-100 text-red-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", getColors())}>
      {normalizedStage}
    </span>
  );
}
