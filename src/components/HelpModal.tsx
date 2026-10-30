import { Modal } from './Modal';

const TIPS: [string, string][] = [
  ['👆', 'Click (or tap) any part of your character — hat, hair, eyes, shirt, shoes — to jump straight to that catalog.'],
  ['🎨', 'Most clothes and hats can be dyed. Pick an item, then a colour from the “Dye it” row. The rainbow swatch picks any colour.'],
  ['🎲', 'Randomize everything with the dice (or press R). Each catalog also has its own 🎲 Random button.'],
  ['🗣️', 'Type a line under the stage and hit “Say it” — your character will say it out loud. Hoods muffle everything. Canadian heads flap.'],
  ['👀', 'Turn your character’s head with the eyes button, or hit 🚶 to watch them hop around the stage like a real cut-out.'],
  ['🤳', 'Photo → Me scans a selfie on your device and picks your hair, beard, glasses, colours and expression. Tap 🔬 to see what it found, change anything that is off, or turn on “cursed mode” to paste your real face on top. Your photo never leaves your device.'],
  ['📸', 'In the Photo Booth, drag characters around (they hop!), point their faces left or right, add speech bubbles, weather and frames, then snap a JPEG.'],
  ['🧑‍🤝‍🧑', 'Save characters to your Crew, then pick a few for a group photo. Export the crew as a file to back it up.'],
  ['🔗', 'Share gives you a link that rebuilds your character for anyone who opens it, plus PNG stickers.'],
];

const KEYS: [string, string][] = [
  ['← / →', 'Flip through items in the open catalog'],
  ['R', 'Randomize everything'],
  ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
  ['Delete', 'Remove the selected character in the Photo Booth'],
  ['Arrow keys', 'Nudge the selected character in the Photo Booth'],
  ['Esc', 'Close a window'],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How this works" icon="❓" onClose={onClose} narrow>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        {TIPS.map(([icon, text]) => (
          <li key={icon} style={{ display: 'flex', gap: 10, fontWeight: 700, lineHeight: 1.35 }}>
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <h3 style={{ fontFamily: 'var(--display)', fontWeight: 400, margin: '18px 0 8px' }}>Keyboard shortcuts</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontWeight: 700 }}>
        <tbody>
          {KEYS.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: '4px 8px 4px 0', whiteSpace: 'nowrap' }}>
                <kbd style={{ border: '2px solid #1d1d1d', borderRadius: 6, padding: '1px 6px', background: '#fff' }}>{k}</kbd>
              </td>
              <td style={{ padding: 4 }}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 13, color: '#5d5a52', marginBottom: 0 }}>
        An unofficial fan-made toy in the construction-paper cut-out style. Not affiliated with anyone who could sue us.
      </p>
    </Modal>
  );
}
