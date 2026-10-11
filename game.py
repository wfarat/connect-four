""" Aby odpalić grę należy wykonać następujące komendy:
    pip install easyAI
    py game.py lub python game.py
"""

from easyAI import TwoPlayerGame, Human_Player, AI_Player, Negamax

class ConnectFour( TwoPlayerGame ):
    """ Connect four.
     https://en.wikipedia.org/wiki/Connect_Four """

    def __init__(self, players):
        self.players = players
        self.board = [[0 for i in range(7)] for j in range(6)]
        self.empty = [6 for i in range(7)]
        self.current_player = 1
    def possible_moves(self): return [i for i in range(7) if self.empty[i] != 0]
    def make_move(self,move):
        self.board[self.empty[move]-1][move] = self.current_player
        self.empty[move] -= 1
    def lose(self):
        return findRowOfFour(self.board, self.opponent_index)

    def is_over(self):
        return self.lose() or (self.possible_moves() == [])
    def show(self):
        print('0 | 1 | 2 | 3 | 4 | 5 | 6 |')
        for i in range(6):
            for j in range(7):
                znak = 'X' if self.board[i][j] == 1 else 'O' if self.board[i][j] == 2 else ' '
                print(znak, end=" | ")
            print()
    def scoring(self):
        return -100 if self.lose() else 0

def findRowOfFour(board, player):
    """ Sprawdza czy gracz ma gdzieś cztery pionki w rzędzie

    Args:
        board(int[]): aktualna plansza gry
        player(int): sprawdzany gracz
    Returns:
        Boolean True jeśli są 4 w rzędzie """

    # pionki pod rząd pionowo dla każdej kolumny
    scoresInCol = [0 for i in range(7)]
    # pionki pod rząd w skosie od lewej
    scoresInDiagonal = [[0 for i in range(7)] for j in range(6)]
    # pionki pod rząd w skosie od prawej
    scoresInReverse = [[0 for i in range(7)] for j in range(6)]
    for i in range(6):
        # pionki pod rząd pionowo
        score = 0
        for j in range(7):
            if board[i][j] == player:
                score += 1
                if score == 4:
                    return True
                scoresInCol[j] += 1
                if i > 0 and j > 0:
                    scoresInDiagonal[i][j] = scoresInDiagonal[i - 1][j - 1] + 1
                else:
                    scoresInDiagonal[i][j] = 1
                if i > 0 and j < 6:
                    scoresInReverse[i][j] = scoresInReverse[i - 1][j + 1] + 1
                else:
                    scoresInReverse[i][j] = 1
                if score == 4 or scoresInCol[j] == 4 or scoresInDiagonal[i][j] == 4 or scoresInReverse[i][j] == 4:
                    return True
            else:
                score = 0
                scoresInCol[j] = 0

    return False

if __name__ == '__main__':

    ai_algo_neg = Negamax(6)
    game = ConnectFour([AI_Player(ai_algo_neg), Human_Player()])
    game.play()
    if game.lose():
        print("Player %d wins." % game.opponent_index)
    else:
        print("Looks like we have a draw.")