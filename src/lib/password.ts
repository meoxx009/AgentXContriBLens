export function calculatePasswordStrength(password: string): {
  score: number; // 0 to 4
  label: "Very Weak" | "Weak" | "Medium" | "Strong" | "Very Strong";
  feedback: string[];
} {
  const feedback: string[] = [];
  if (!password) {
    return { score: 0, label: "Very Weak", feedback: ["Password is required"] };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  else feedback.push("Use at least 8 characters");

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push("Include at least one uppercase letter");

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push("Include at least one number");

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push("Include at least one special character (!@#$%^&*)");

  const labels: Array<"Very Weak" | "Weak" | "Medium" | "Strong" | "Very Strong"> = [
    "Very Weak",
    "Weak",
    "Medium",
    "Strong",
    "Very Strong",
  ];

  return {
    score,
    label: labels[score],
    feedback,
  };
}
