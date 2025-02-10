<script setup>
import { onMounted } from 'vue';
 
// Utilisation de `colorSelected` pour gérer l'état du toggle
const colorSelected = ref(true);

// Utilisation du mode de couleur via `useColorMode`
const colorMode = useColorMode();
console.log(colorMode.preference);

// Fonction pour changer le mode de couleur
function change() {
    if (colorSelected.value) {
        colorMode.preference = 'dark';
    } else {
        colorMode.preference = 'light';
    }
}

// Fonction pour mettre à jour le thème en fonction de la couleur de fond actuelle
function UpdateTheme() {
    // Obtenir la couleur actuelle du fond
    const bodyBgColor = getComputedStyle(document.body).backgroundColor;

    // Convertir la couleur en mode hexadécimal ou vérifier les valeurs RGB
    if (bodyBgColor === 'rgb(9, 26, 40)' || bodyBgColor === '#091a28') { // Couleur sombre
        colorSelected.value = false;
        colorMode.preference = 'dark';
    } else { // Couleur claire par défaut
        colorSelected.value = true;
        colorMode.preference = 'light';
    }
}

// Mettre à jour le thème au montage du composant
onMounted(() => {
    UpdateTheme();
});
</script>

<template>
    <div>
        <!-- Toggle pour changer de thème -->
        <UToggle v-model="colorSelected" @click="change()" off-icon="ph:sun" on-icon="ph:moon-stars-duotone"
            class="reverse-toggle" />
    </div>
</template>

<style>
/* Mode clair par défaut */
body {
    background-color: #fff;
    color: rgba(0, 0, 0, 0.8);
}

/* Mode sombre */
html.dark body {
    background-color: #091a28;
    color: #ebf4f1;
}

html.dark select {
    background-color: #091a28;
    color: #ebf4f1;
}

/* Mode sepia */
html.sepia body {
    background-color: #f1e7d0;
    color: #433422;
}

/* Inverser le sens du toggle */
.reverse-toggle {
    transform: scaleX(-1);
}
</style>
