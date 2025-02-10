<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";

const toast = useToast();
const router = useRouter();

definePageMeta({
  layout: 'dashboard',
});

interface CreateServerResponse {
  success: boolean;
  message: string;
}

interface ServerNameFormModel {
  serverName: string;
}

const serverNameForm = ref<ServerNameFormModel>({
  serverName: "",
});

async function createServer() {
  const token = useCookie("authToken").value;

  if (!token) {
    toast.add({
      title: "Error",
      description: "User not authenticated",
      color: "red",
    });
    return;
  }

  try {
    const response = await $fetch<CreateServerResponse>("/api/dockers/createserver", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ serverName: serverNameForm.value.serverName }),
    });

    if (response.success) {
      toast.add({
        title: "Success",
        description: `Server '${serverNameForm.value.serverName}' created successfully.`,
        color: "green",
      });
      router.push("/dashboard");
    } else {
      toast.add({
        title: "Error",
        description: response.message,
        color: "red",
      });
    }
  } catch (error) {
    console.error(error);
    toast.add({
      title: "Error",
      description: "An error occurred while creating the server",
      color: "red",
    });
  }
}
</script>

<template>
  <main>
    <UForm :state="serverNameForm">
      <UFormGroup label="Nom du serveur" name="serverName" class="mb-3" required>
        <UInput v-model="serverNameForm.serverName" icon="i-ph-envelope" />
      </UFormGroup>
      <UButton @click="createServer" class="mt-3" color="primary">
        Créer le serveur
      </UButton>
    </UForm>
  </main>
</template>
