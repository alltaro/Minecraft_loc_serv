<script setup>
import { ref, onMounted, onBeforeUnmount, computed, toDisplayString } from 'vue';
import { useRoute } from 'vue-router';

definePageMeta({
  layout: "dashboard",
});
const toast = useToast()
const route = useRoute();
const dockerId = route.params.id;
console.log(dockerId);
const isLoading = ref(false);
const updateInterval = ref(null); // Référence pour stocker l'intervalle d'actualisation

const server = ref({});

// Fonction pour démarrer le serveur via l'API
const startServer = async () => {
  isLoading.value = true;
  const serverName = server.value.serverName;
  try {
    const token = useCookie("authToken").value; // Remplace par le token actuel de l'utilisateur
    const response = await fetch(`/api/dockers/startserver/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, serverName }),
    });
    const data = await response.json();
    if (response.ok) {
      console.log('Server started successfully', data);
      server.value.Running = true; // Met à jour l'état du serveur
    } else {
      console.log('Failed to start server:', data.error);
    }
  } catch (error) {
    console.log('Error starting server:', error);
  } finally {
    isLoading.value = false;
  }
};

// Fonction pour arrêter le serveur via l'API
const stopServer = async () => {
  toast.add({
    color: "amber",
    title: "Server stopping",
    icon: "solar:restart-square-broken",
    description: "user signed out successfully.",
  });
  isLoading.value = true;
  const serverName = server.value.serverName;
  try {
    const token = useCookie("authToken").value; // Remplace par le token actuel de l'utilisateur
    const response = await fetch(`/api/dockers/stopserver/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, serverName }),
    });
    const data = await response.json();
    if (response.ok) {
      console.log('Server stopped successfully', data);
      server.value.Running = false; // Met à jour l'état du serveur
    } else {
      console.log('Failed to stop server:', data.error);
    }
  } catch (error) {
    console.log('Error stopping server:', error);
  } finally {
    isLoading.value = false;
  }
};

const deleted = async () => {

  isLoading.value = true;
  const serverName = server.value.serverName;
  try {
    const token = useCookie("authToken").value; // Remplace par le token actuel de l'utilisateur
    const response = await fetch(`/api/dockers/stopserver/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, serverName }),
    });
    const data = await response.json();
    if (response.ok) {
      console.log('Server stopped successfully', data);
      server.value.Running = false; // Met à jour l'état du serveur
      toast.add({
        color: "amber",
        title: "Server deleted",
        icon: "solar:restart-square-broken",
        description: "user signed out successfully.",
      });
      navigateTo('/dashboard')
    } else {
      console.log('Failed to stop server:', data.error);
    }
  } catch (error) {
    console.log('Error stopping server:', error);
  } finally {
    isLoading.value = false;
  }
}

// Fonction pour récupérer l'état du serveur
const fetchServerStatus = async () => {
  try {
    const token = useCookie("authToken").value; // Remplacé par le token
    if (!token) {
      navigateTo("/")
    }
    const response = await fetch('/api/dockers/getServerStatus', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token, dockerId }),
    });
    const data = await response.json();
    console.log(data);
    server.value = data;
  } catch (error) {
    console.error('Error fetching server status:', error);
    toast.add({
      color: "red",
      title: "Error",
      description: 'Error fetching server status:' + error,
      icon: "material-symbols:error"
    })
  }
};

function status() {
  fetchServerStatus()
  toast.add({
    color: "blue",
    title: "work",
    description: 'status' + server.value.status,
    icon: "material-symbols:error"
  })
}

// Fonction pour récupérer l'état du serveur et démarrer l'update après la réception
const serverName = async () => {
  await fetchServerStatus(); // Récupère l'état du serveur une première fois
  startUpdating(); // Démarre l'actualisation périodique après la première récupération
};

// Computed pour définir la couleur en fonction de l'état du serveur
const serverNameStyle = computed(() => {
  return server.value.Running ? { color: 'green' } : { color: 'red' };
});

// Computed pour déterminer le texte du bouton
const buttonText = computed(() => {
  if (server.value.status == 'running') { return 'Arrêter le serveur' }
  else { return 'Démarrer le serveur' };
});

// Computed pour déterminer l'action du bouton (démarrer ou arrêter)
const buttonAction = computed(() => {
  if (server.value.status == 'running') { return stopServer }
  else { return startServer };
});

// Fonction pour démarrer l'actualisation périodique
const startUpdating = () => {
  updateInterval.value = setInterval(() => {
    fetchServerStatus(); // Actualise l'état du serveur toutes les X secondes
  }, 5000); // Actualisation toutes les 5 secondes (ajustable)
};

// Nettoyer l'intervalle d'actualisation lorsqu'on quitte la page
onBeforeUnmount(() => {
  if (updateInterval.value) {
    clearInterval(updateInterval.value);
  }
});

// Initialiser l'actualisation au montage du composant
onMounted(() => {
  serverName(); // Récupère l'état du serveur une première fois et démarre l'update après
});
</script>

<template>
  <div>
    <UBreadcrumb divider="/"
      :links="[{ label: 'Dashboard', to: '/' }, { label: 'Servers' }, { label: `${server.serverName}` }]"
      :style="serverNameStyle" />
    <button @click="buttonAction" :disabled="isLoading">
      {{ isLoading ? 'En cours...' : buttonText }}
    </button>
    <UButton label="Open" @click="status()" />
    <UButton label="Remove" @click="deleted()" />

    <article>
      status : {{ server.status }}
      <br>
      port : {{ server.port }}
    </article>

  </div>
</template>

<style scoped>
button {
  padding: 0.5rem 1rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}
</style>
