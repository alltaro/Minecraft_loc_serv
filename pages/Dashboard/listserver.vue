<script setup>
import { useRouter } from 'vue-router';

const servers = ref([]);
const router = useRouter();

definePageMeta({
    layout: "dashboard",
});

try {
    const token = useCookie("authToken").value; // Remplace par le token actuel de l'utilisateur
    const response = await fetch('/api/dockers/getUserServers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
    });
    const data = await response.json();
    console.log(data.body.servers)
    // Transforme l'objet en tableau d'objets
    servers.value = data.body.servers

} catch (error) {
    console.error('Erreur de récupération des serveurs:', error);
}

// Fonction pour rediriger vers la page de démarrage du serveur
const goToServerPage = (serverId) => {
    navigateTo(`/Dashboard/startServer/${serverId}`);
};
</script>

<template>
    <div>
        <h3>Liste des serveurs</h3>
        <div class="server-list">
            <div v-for="(server, name) in servers" class="server-card" @click="goToServerPage(server)">
                <h4>{{ name }}</h4>
                <br>
                <p>ID: {{ server }}</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.server-list {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
}

.server-card {
    width: 200px;
    padding: 1rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    cursor: pointer;
    transition: box-shadow 0.2s;
    color: whitesmoke
}

.server-card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
</style>
