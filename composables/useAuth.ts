import type { AuthPayload } from "~/types";

// Création de l'état de session utilisateur
const useUserSessionState = () =>
  useState<AuthPayload>("nuxt-mongoose-auth", () => ({}));

interface logged {
  value: boolean;
}

export function useAuth() {
  const sessionState = useUserSessionState();

  return {
    loggedIn: computed(() => Boolean(sessionState.value?.email)),
    user: computed(() => sessionState.value || null),
    clear,
    me,
  };
}
// Fonction pour obtenir les informations sur l'utilisateur actuellement connecté
async function me() {
  try {
    const response = await $fetch("/api/auth/me", {
      headers: {
        Accept: "application/json",
      },
    });
    useUserSessionState().value = response;
  } catch (error) {
    console.error(
      "Erreur lors de la récupération des informations utilisateur",
      error
    );
    useUserSessionState().value = {};
  }
}

// Fonction pour se déconnecter
async function clear() {
  try {
    await $fetch("/api/auth/logout", { method: "DELETE" });
    useUserSessionState().value = {};
  } catch (error) {
    console.error("Erreur lors de la déconnexion", error);
  }
}
