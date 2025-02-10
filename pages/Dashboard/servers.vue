<script setup lang="ts">
definePageMeta({
    layout: "dashboard",
});

let servers = ref<{ [serverName: string]: string } | null>(null);

const fetchUserServers = async () => {
    const token = useCookie("authToken").value;
    console.log(`tokened : ${token}`);
    if (token) {
        try {
            const data = await $fetch("/api/dockers/listservers", {
                method: "POST",
                body: JSON.stringify({ token }),
            });
            if (data.success) {
                console.log(data)
                servers.value = data.servers;  // Accéder à la propriété `servers` de la réponse
            } else {
                console.log("Failed to fetch servers");
            }
        } catch (err) {
            console.log("An error occurred while fetching user info");
        }
    }
};
fetchUserServers();
</script>
<template>
    <div>
        <Ucard title="Add" icon="i-ph-file-plus-duotone" class="cursor-pointer border border-primary">
            <template #header>
                <h1>"create new post"</h1>
                <Placeholder class="h-8" />
            </template>

            <Placeholder class="h-32" />
            <h1> Content</h1>
            <h2> {{ servers }} </h2>
        </Ucard>
    </div>
</template>