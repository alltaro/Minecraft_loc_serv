<template>
  <NuxtLoadingIndicator />
  <div class="dashboard-container">
    <header class="header">
      <Hheader />
    </header>
    <aside class="sidebar">
      <Vnavigation />
    </aside>
    <main class="main-content">
      <!-- Le contenu des pages spécifiques sera rendu ici -->
      <NuxtPage />
    </main>
  </div>
</template>

<script setup lang="ts">
const token = useCookie("authToken").value;
if (!token) {
  navigateTo("/");
}
// Tu peux importer tes composants ici si nécessaire
// import Hheader from '~/components/Hheader.vue';
// import Vnavigation from '~/components/Vnavigation.vue';
</script>

<style scoped>
.dashboard-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  height: 60px;
  background-color: #4caf50; /* Couleur verte pour le header */
}

.sidebar {
  width: 250px;
  height: calc(100vh - 60px); /* Prend toute la hauteur en dessous du header */
  position: fixed;
  top: 60px; /* Alignez avec la hauteur du header */
  left: 0;
  background-color: #1f1f1f;
  overflow-y: auto;
}

.main-content {
  margin-left: 250px; /* Espace laissé par la sidebar */
  padding: 20px;
  flex: 1;
  background-color: #101010;
  color: white;
}
</style>
