import { useState, type FormEvent } from 'react';
import { call, errorMessage } from '../firebase';

export function Support() {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'sent'; id: string } | { kind: 'failed'; text: string }>({ kind: 'idle' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState({ kind: 'busy' });
    try {
      const { ticketId } = await call<{ email: string; subject: string; message: string }, { ticketId: string }>('support-submitTicket', {
        email,
        subject,
        message,
      });
      setState({ kind: 'sent', id: ticketId });
      setSubject('');
      setMessage('');
    } catch (err) {
      setState({ kind: 'failed', text: errorMessage(err) });
    }
  };

  return (
    <form className="entry" onSubmit={(e) => void submit(e)}>
      <h2>Contact support</h2>
      <label>
        Your email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Subject
        <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} required />
      </label>
      <label>
        Message
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={6} required />
      </label>
      {state.kind === 'failed' && <p role="alert" className="error">We could not send your message: {state.text}</p>}
      {state.kind === 'sent' && <p role="status">Thanks. Your ticket number is {state.id}.</p>}
      <button type="submit" disabled={state.kind === 'busy'}>{state.kind === 'busy' ? 'Sending…' : 'Send'}</button>
    </form>
  );
}
