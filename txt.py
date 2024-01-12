def ascii():
    """remplir un tableau 8*16 avec des caractères du code ASCII"""
    tableau = [[0]*16 for i in range(8)]
    for ligne in range(8):
        for col in range(16):
            tableau[ligne][col] = chr(16*ligne+col)
    return tableau


def lire(tab):
    for ligne in tab:
        for col in ligne:
            print(col, end=" ")
        print()
lire(ascii())