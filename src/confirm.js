// What the chat says after the contact fields are submitted. Shared by /contact and the tests.
// No promises about timing ("urgently", "as soon as possible") or outcomes.

export function confirmationReply({ name, phone, email, matter, urgent, lang, schedule, bookingUrl }) {
  const es = lang === "es";
  const first = String(name || "").trim().split(/\s+/)[0] || (es ? "" : "");
  const reach = phone || email;
  if (schedule) {
    return es ? `Gracias, ${first}. Elija el horario que le quede mejor para su consulta.` : `Thanks, ${first}. Pick whichever consultation time works best for you.`;
  }
  if (urgent) {
    return es
      ? `Gracias, ${first}. La firma ya tiene sus datos. Si alguien está en peligro inmediato, llame al 911.`
      : `Thanks, ${first}. The firm has your details. If anyone is in immediate danger, call 911.`;
  }
  if (matter === "existing_client") {
    return es ? `Gracias, ${first}. La firma se comunicará con usted al ${reach}.` : `Thanks, ${first}. The firm will get back to you at ${reach}.`;
  }
  const booking = (bookingUrl || "").trim();
  if (booking) {
    return es ? `Gracias, ${first}. Puede elegir un horario para su consulta aquí: ${booking}` : `Thanks, ${first}. You can pick a consultation time here: ${booking}`;
  }
  return es
    ? `Gracias, ${first}. Alguien de la firma se comunicará con usted al ${reach} para programar una consulta.`
    : `Thanks, ${first}. Someone from the firm will contact you at ${reach} to set up a consultation.`;
}

// What the bot sees on later turns, so it doesn't ask again.
export function formNote({ name, phone, email, opposing_party }) {
  return `My details: Name: ${name}. Phone: ${phone || "none"}. Email: ${email || "none"}. Other party: ${opposing_party || "not given"}.`;
}
