#include "prg32.h"
#include "prg32_multiplayer.h"

#include <stdint.h>

#define SCREEN_W 320
#define SCREEN_H 200
#define BALL_R 12
#define ROOM_SIGNATURE "poing-wall-v1"

/* Added by the firmware enhancement specification. */
extern uint32_t prg32_multiplayer_local_player_id(void);

static int32_t ball_x;
static int16_t ball_y;
static int16_t velocity_x;
static int16_t velocity_y;
static uint32_t frame;

static void sort_ids(uint32_t *ids, int count) {
    for (int i = 1; i < count; ++i) {
        uint32_t value = ids[i];
        int j = i;
        while (j > 0 && ids[j - 1] > value) {
            ids[j] = ids[j - 1];
            --j;
        }
        ids[j] = value;
    }
}

static int roster(uint32_t *ids, int capacity, uint32_t local_id) {
    int count = 0;
    if (local_id && count < capacity) ids[count++] = local_id;
    int peers = prg32_multiplayer_get_peer_count();
    for (int i = 0; i < peers && count < capacity; ++i) {
        prg32_player_state_t peer;
        if (prg32_multiplayer_get_peer(i, &peer) == 0 && peer.player_id)
            ids[count++] = peer.player_id;
    }
    sort_ids(ids, count);
    return count;
}

void poing_multiplayer_init(void) {
    ball_x = 40;
    ball_y = 50;
    velocity_x = 3;
    velocity_y = 2;
    frame = 0;
    prg32_multiplayer_init();
    prg32_multiplayer_join(ROOM_SIGNATURE, PRG32_MP_FLAG_ENABLE);
}

void poing_multiplayer_update(void) {
    uint32_t local_id = prg32_multiplayer_local_player_id();
    uint32_t ids[PRG32_MP_MAX_PEERS + 1];
    int count;
    prg32_multiplayer_tick();
    count = roster(ids, PRG32_MP_MAX_PEERS + 1, local_id);
    if (!local_id || count == 0) return;

    /* The lowest player ID is the sole simulation authority. Global X fits
       int16_t for the supported nine-screen roster. */
    if (ids[0] == local_id) {
        ball_x += velocity_x;
        ball_y += velocity_y;
        if (ball_x <= BALL_R || ball_x >= count * SCREEN_W - BALL_R)
            velocity_x = -velocity_x;
        if (ball_y <= BALL_R || ball_y >= SCREEN_H - BALL_R)
            velocity_y = -velocity_y;
        ++frame;
        prg32_multiplayer_set_local_state((int16_t)ball_x, ball_y, 0, 1);
    } else {
        for (int i = 0; i < prg32_multiplayer_get_peer_count(); ++i) {
            prg32_player_state_t peer;
            if (prg32_multiplayer_get_peer(i, &peer) == 0 && peer.player_id == ids[0]) {
                ball_x = peer.x;
                ball_y = peer.y;
                frame = peer.frame;
                break;
            }
        }
    }
}

void poing_multiplayer_draw(void) {
    uint32_t local_id = prg32_multiplayer_local_player_id();
    uint32_t ids[PRG32_MP_MAX_PEERS + 1];
    int count = roster(ids, PRG32_MP_MAX_PEERS + 1, local_id);
    int screen = 0;
    for (; screen < count && ids[screen] != local_id; ++screen) {}
    int local_x = (int)ball_x - screen * SCREEN_W;
    prg32_gfx_clear(0x0000);
    prg32_gfx_text8(8, 8, "POING MULTIPLAYER WALL", 0xffff, 0x0000);
    if (local_x >= -BALL_R && local_x < SCREEN_W + BALL_R)
        prg32_gfx_rect(local_x - BALL_R, ball_y - BALL_R, BALL_R * 2, BALL_R * 2, 0xf81f);
    prg32_gfx_rect(0, SCREEN_H - 3, SCREEN_W, 3, 0x07ff);
    (void)frame;
}
