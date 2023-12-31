# Utiliser une image de base Java 17
FROM openjdk:17

# Exposer le port 25565 pour le serveur Minecraft
EXPOSE 25565

# Créer un répertoire pour le serveur Minecraft
WORKDIR minecraft

# Copier le fichier du serveur Minecraft dans le conteneur Docker
COPY minecraft_server.jar ./minecraft_server.jar

COPY neweula.txt ./eula.txt

# Exécuter le serveur Minecraft lors du démarrage du conteneur
CMD java -Xmx1024M -Xms1024M -jar ./minecraft_server.jar nogui


