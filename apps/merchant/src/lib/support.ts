export const SUPPORT_PHONE_DISPLAY = "0735 656 066";
export const SUPPORT_PHONE_E164 = "+254735656066";

export function whatsappLink(message = "Hi CRAL"): string {
  return `https://wa.me/${SUPPORT_PHONE_E164.slice(1)}?text=${encodeURIComponent(message)}`;
}
