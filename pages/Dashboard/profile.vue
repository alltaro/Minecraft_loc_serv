<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useFetch } from "#app"; // Utilisez useFetch pour appeler les API routes Nuxt

definePageMeta({
  layout: "dashboard",
});

interface UserInfo {
  username: string;
  email: string;
}

const userInfo = ref<UserInfo | null>(null);
const erreur = ref<string | null>(null);

const fetchUserInfo = async () => {
  const token = useCookie("authToken").value;
  console.log(`tokened : ${token}`);
  if (token) {
    try {
      const data = await $fetch("/api/user", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      if (data) {
        if ("userInfo" in data && data.userInfo != null) {
          userInfo.value = data.userInfo; // Assurez-vous de stocker directement l'objet userInfo
        } else if ("error" in data) {
          erreur.value = data.error;
        }
      }
    } catch (err) {
      erreur.value = "An error occurred while fetching user info";
    }
  }
};

onMounted(() => {
  fetchUserInfo();
});
</script>

<template>
  <div>
    <div v-if="!erreur && userInfo">
      <p>Username: {{ userInfo.username }}</p>
      <p>Email: {{ userInfo.email }}</p>
    </div>

    <div v-if="erreur">
      <p>{{ erreur }}</p>
    </div>

    <!-- Si l'utilisateur n'est pas connecté, on montre le composant Auth -->
    <div><h1>Salut</h1></div>
  </div>
</template>
